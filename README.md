# Sigh Image Inverse

**Before image + after image → seek the EQ that changed it.**

An interactive, offline-first inverse companion to [SighImageSuper](https://github.com/anttiluode/SighImageSuper), inspired by the residue-guided proposals in [Luotain2](https://github.com/anttiluode/Luotain2).

Open **[index.html](index.html)** locally in your browser (with solver.js in the same directory). No Python, server, GPU, npm dependencies, cloud processing or image uploads. To publish as a live website, enable GitHub Pages for the repository (Settings → Pages → Deploy from branch → main / root).

## What to do

1. Start with the **built-in mystery**. It makes a recognizable image, adds small calibration grain to excite high spatial frequencies, runs an unknown ten-band EQ through the original Sigh recursion, and hides its curve.
2. Click **One probe** to see a single adjustment, or **Seek EQ** to watch the residue drive greedy band-by-band search.
3. See the **original**, **altered**, **reconstructed**, and **residue** images. The seeker begins with the identity rule, meaning "nothing changed".
4. Click **Reveal hidden EQ** and compare the recovered curve with the actual one.
5. Click **Test on unseen image**. A different generated image is processed through the real hidden filter and the learned filter. This is the generalization control; matching only the training picture is not enough.
6. Use **Load original** and **Load changed** to try aligned photos from your own Sigh loop. Set the *known* number of passes and alpha before seeking. Those two values generally cannot be deduced from one pair. For imported pairs, a close fit does not uniquely identify the transformation.

The app runs on 128×128 centered grayscale arrays; uploaded images are center-cropped independently to square. Compare only images already aligned, with no brightness/contrast changes or resizing between them beyond identical preprocessing. The synthetic target stays in floating point; clipping occurs only for visualization.

## Exact original Sigh convention

The [SighImageSuper Python source](https://github.com/anttiluode/SighImageSuper/blob/main/sigh_image_live_loop_fixed.py) uses a **ten-point gain curve** over normalized **squared radial frequency** (k²), interpolated to a **256-entry lookup table**, and indexed with floor(k² × 255). This app matches those choices, including the Nyquist corner at index 255. These are not ten equal-width rings of *linear* frequency.

For each Fourier mode with per-pass gain g, Sigh's original recursion is:

    x[n+1] = alpha * x_original + (1-alpha) * F_EQ(x[n])
    h[0] = 1
    h[n+1] = alpha + (1-alpha) * g * h[n]

Thus h[n] is the effective gain after n passes. The inverse measures h from the source and changed Fourier coefficients where there is input energy. Given assumed n and alpha, it inverts the scalar recurrence by bisection to find each mode's g. Then it fits a ten-control interpolated EQ using the *remaining unexplained spectral difference* to propose the most helpful single control change, repeatedly.

This is deliberately **narrower than Luotain2**: it is not a general symbolic operator search. Its search space is the ten controls of the real Sigh filter. The seeker is a residue-guided model fitter/probe, **not** a trained neural attention head. The original provides the test signal and the modes available to probe.

## What the readouts mean

- **Pixel RMSE:** altered image minus a replay of the original through the inferred EQ, measured as root-mean-square error.
- **Held-out frequencies:** approximately 1/11 of spectral coordinates are withheld from fitting. This is a partial check *within one picture*, not independent-image validation.
- **Evidence bars:** how strongly the original image constrains each EQ control. Near-zero support = unknown.
- **Residue:** what the model still fails to predict. A high remaining residue can indicate the wrong operator family, not just the wrong gain curve.

## Hard limits and controls

- If the original image has zero power at a frequency, that frequency's gain is **not identifiable**. The starting gain of 1 in unknown bands is a prior, not a discovered law.
- A single pair generally cannot identify both the number of repeated Sigh passes and alpha. Large pass counts compress gain differences toward indistinguishable outputs.
- A real radial EQ cannot produce arbitrary geometric translation or phase manipulation, nor necessarily explain clipping, gamma changes, JPEG artifacts, registration errors, nonlinear bilateral processing, noise, RGB channel mixing or unrelated changes between images.
- Synthetic mystery images are created *by the same forward family* used in the inverse, so successful recovery validates the implementation and identifiability only. It is not evidence the technique can infer unknown real-world physics.
- Direct Fourier ratios are a classical tool for system identification. The distinctive aim here is to make the process visible in the style of Sigh and Luotain, not claim a new mathematical theorem.

## Test

Run from a GitHub checkout:

    node tests/inverse.test.js

Tests cover a numerical FFT round-trip; original Sigh k² indexing; alpha-feedback recursion; recovery of hidden ten-band laws with multiple pass counts and alpha settings; transfer to a genuinely unseen test image; the no-information zero-image case; and the negative control of a spatially shifted target.

No packages to install. This is a static client-side application.

## Family

- [SighImageSuper](https://github.com/anttiluode/SighImageSuper) — choose an operator; see what survives
- [Sihti](https://github.com/anttiluode/Sihti) — preserve what would otherwise disappear
- [Luotain2](https://github.com/anttiluode/Luotain2) — the unexplained residue proposes the next rule
- **SighImageInverse** — observe what changed; identify a constrained operator; replay it

This is **inverse operator identification**, not recovery of discarded original pixels from the after-image alone.
