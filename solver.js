/* SighImageInverse: independent, dependency-free numerical core.
   Fourier convention and ten-band LUT match SighImageSuper's
   normalized k^2 -> floor(k^2 * 255) -> 256-entry EQ lookup.
   Public-domain style implementation; all processing stays in the browser. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SighInverse = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var KNOTS = 10, LUT = 256;
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function fft1(re, im, inverse) {
    var n = re.length, j = 0;
    for (var i = 1; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var angle = (inverse ? 2 : -2) * Math.PI / len;
      var wr0 = Math.cos(angle), wi0 = Math.sin(angle);
      for (var off = 0; off < n; off += len) {
        var wr = 1, wi = 0;
        for (var k = 0; k < len / 2; k++) {
          var a = off + k, b = a + len / 2;
          var vr = re[b] * wr - im[b] * wi;
          var vi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr; im[a] += vi;
          var next = wr * wr0 - wi * wi0;
          wi = wr * wi0 + wi * wr0;
          wr = next;
        }
      }
    }
    if (inverse) for (var p = 0; p < n; p++) { re[p] /= n; im[p] /= n; }
  }
  function fft2(array, N, inverse) {
    if ((N & (N - 1)) || array.length !== N * N) throw Error("Square power-of-two image required");
    var re = new Float64Array(array), im = new Float64Array(N * N);
    transform2(re, im, N, !!inverse);
    return { re: re, im: im };
  }
  function transform2(re, im, N, inverse) {
    var a = new Float64Array(N), b = new Float64Array(N);
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) { a[x] = re[y * N + x]; b[x] = im[y * N + x]; }
      fft1(a, b, inverse);
      for (var xx = 0; xx < N; xx++) { re[y * N + xx] = a[xx]; im[y * N + xx] = b[xx]; }
    }
    for (var x2 = 0; x2 < N; x2++) {
      for (var yy = 0; yy < N; yy++) { a[yy] = re[yy * N + x2]; b[yy] = im[yy * N + x2]; }
      fft1(a, b, inverse);
      for (var y2 = 0; y2 < N; y2++) { re[y2 * N + x2] = a[y2]; im[y2 * N + x2] = b[y2]; }
    }
  }
  function lookupIndex(y, x, N) {
    var ky = y <= N / 2 ? y : y - N;
    var kx = x <= N / 2 ? x : x - N;
    // k^2.max = (N/2)^2 + (N/2)^2 on even square grids
    return Math.min(255, Math.floor(255 * (ky * ky + kx * kx) / (N * N / 2)));
  }
  function basis(bin) {
    // Same 256-entry curve and quantized floor indexing as the Python Sigh source.
    var u = bin / 255 * (KNOTS - 1);
    var i = Math.min(KNOTS - 2, Math.floor(u));
    return [i, 1 - (u - i), u - i];
  }
  function gainAt(bin, gains) {
    var b = basis(bin);
    return b[1] * gains[b[0]] + b[2] * gains[b[0] + 1];
  }
  function transfer(g, passes, alpha) {
    var h = 1;
    for (var i = 0; i < passes; i++) h = alpha + (1 - alpha) * g * h;
    return h;
  }
  function invertTransfer(h, passes, alpha) {
    h = clamp(h, transfer(0, passes, alpha), 1);
    var lo = 0, hi = 1;
    for (var i = 0; i < 31; i++) {
      var m = (lo + hi) / 2;
      if (transfer(m, passes, alpha) < h) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }
  function fromSpectrum(fr, fi, N) {
    var re = new Float64Array(fr), im = new Float64Array(fi);
    transform2(re, im, N, true);
    return re;
  }
  function forward(src, N, gains, passes, alpha, cachedFFT) {
    var f = cachedFFT || fft2(src, N, false);
    var re = new Float64Array(f.re), im = new Float64Array(f.im);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var p = y * N + x;
      var h = transfer(gainAt(lookupIndex(y, x, N), gains), passes, alpha);
      re[p] *= h; im[p] *= h;
    }
    return fromSpectrum(re, im, N);
  }
  function rmse(a, b) {
    var e = 0;
    for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; e += d * d; }
    return Math.sqrt(e / a.length);
  }
  function prepare(source, observed, N, passes, alpha) {
    if (source.length !== N*N || observed.length !== N*N) throw Error("Image size mismatch");
    var A = fft2(source, N, false), B = fft2(observed, N, false);
    var pow = [], sumP = 0, maxP = 0, nonzero = [];
    for (var t = 0; t < N*N; t++) {
      var p = A.re[t] * A.re[t] + A.im[t] * A.im[t];
      pow[t] = p; sumP += p; maxP = Math.max(maxP, p);
      if (p > 1e-17) nonzero.push(Math.sqrt(p));
    }
    nonzero.sort(function(a,b){return a-b;});
    var med = nonzero.length ? nonzero[Math.floor(nonzero.length/2)] : 0;
    var cap = med * 18;
    var cutoff = Math.max(sumP / (N*N) * 1e-7, 1e-16);
    var items = [], support = new Float64Array(KNOTS);
    var clipped = 0, use = 0, ignored = 0;
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var k = y*N+x, power = pow[k];
      if (power < cutoff) { ignored++; continue; }
      var effective = (A.re[k]*B.re[k] + A.im[k]*B.im[k]) / power;
      if (effective < -0.005 || effective > 1.005) clipped++;
      var target = invertTransfer(effective, passes, alpha);
      var weight = Math.min(Math.sqrt(power), Math.max(cap, 1e-12));
      if (weight <= 0) continue;
      var b = basis(lookupIndex(y, x, N));
      var c0 = weight * b[1]*b[1], c1 = weight * b[2]*b[2];
      support[b[0]] += c0; support[b[0]+1] += c1;
      items.push({i:b[0],a:b[1],b:b[2],t:target,w:weight,check:((x*29+y*17+13)%11 === 0)});
      use++;
    }
    var maxSupport = Math.max.apply(null, Array.from(support));
    var confidence = Array.from(support, function(s){ return maxSupport ? s/maxSupport : 0; });
    return { source:source, observed:observed, N:N, passes:passes, alpha:alpha,
      spectrum:A, items:items, support:support, confidence:confidence,
      ignored:ignored, clipped:clipped, used:use, cutoff:cutoff };
  }
  function objective(items, curve, check) {
    var loss=0, norm=0;
    for (var i=0; i<items.length; i++) {
      var r=items[i];
      if (!!r.check !== check) continue;
      var v = r.a*curve[r.i]+r.b*curve[r.i+1]-r.t;
      loss += r.w*v*v; norm += r.w;
    }
    return norm ? Math.sqrt(loss/norm) : NaN;
  }
  function greedy(prep, maxSteps) {
    maxSteps = maxSteps || 65;
    var gains = Array(KNOTS).fill(1), history = [{band:-1,gains:gains.slice(),train:objective(prep.items,gains,false),holdout:objective(prep.items,gains,true)}];
    var enough = prep.support.map(function(s){return s>Math.max.apply(null, Array.from(prep.support))*0.0006;});
    for (var step=0; step<maxSteps; step++) {
      var numer = new Float64Array(KNOTS), denom = new Float64Array(KNOTS);
      for (var z=0; z<prep.items.length; z++) {
        var r=prep.items[z];
        if (r.check) continue;
        var error = r.t-r.a*gains[r.i]-r.b*gains[r.i+1];
        numer[r.i] += r.w*r.a*error;
        denom[r.i] += r.w*r.a*r.a;
        numer[r.i+1] += r.w*r.b*error;
        denom[r.i+1] += r.w*r.b*r.b;
      }
      var best=-1, delta=0, benefit=0;
      for (var i=0; i<KNOTS; i++) {
        if (!enough[i] || denom[i]<=1e-15) continue;
        var d=clamp(gains[i]+numer[i]/denom[i],0,1)-gains[i];
        var improvement=2*d*numer[i]-d*d*denom[i];
        if (improvement>benefit) { benefit=improvement; best=i; delta=d; }
      }
      if (best<0 || benefit<1e-14) break;
      gains[best] = clamp(gains[best]+delta,0,1);
      history.push({band:best, gains:gains.slice(), train:objective(prep.items,gains,false),holdout:objective(prep.items,gains,true),benefit:benefit});
      if (history.length>12 && benefit<1e-9) break;
    }
    return {history:history, gains:gains, known:enough, confidence:prep.confidence};
  }
  return {fft2:fft2, fromSpectrum:fromSpectrum, lookupIndex:lookupIndex,
    basis:basis, gainAt:gainAt, transfer:transfer, invertTransfer:invertTransfer,
    forward:forward, rmse:rmse, prepare:prepare, greedy:greedy};
});
