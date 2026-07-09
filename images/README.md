# Case-study screenshots

Drop project screenshots in this folder, then swap the matching `img(...)` call in
`index.html`. Until a real file is referenced, each slot keeps rendering the shimmer
placeholder — so you can fill these in one at a time.

## How to wire a screenshot in

The `img()` helper (in `index.html`, search for `function img`) takes an optional 3rd arg:

```js
img('Dashboard Overview')                                   // placeholder (current)
img('Dashboard Overview', false, 'images/saas-overview.png') // real screenshot
```

Retina (`@2x`) + custom alt text — pass an object instead of a string:

```js
img('Dashboard Overview', false, {
  src:  'images/saas-overview.png',      // 1x
  src2x:'images/saas-overview@2x.png',   // 2x, served on Retina via srcset
  alt:  'The Hush venue dashboard home'  // optional; defaults to the label
})
```

The image is shown `object-fit: cover`, anchored to the top. The label becomes a caption
that fades in on hover. The 2nd arg (`tall`) switches the box from 16:9 to 4:3.

## Capture targets

Export PNG (or WebP to keep `index.html` light). Shoot at **2× DPR** for crispness — in
Chrome: `Cmd+Shift+M` → set DPR 2 → `Cmd+Shift+P` → "Capture full size screenshot".
Mobile shots: iOS Simulator `Cmd+S` (native 3×).

## Checklist

### SaaS Dashboard  (case study in index.html)
| Placeholder label | Suggested filename | Ratio | img() line |
|---|---|---|---|
| Dashboard Overview | `saas-overview.png` | 16:9 | ~6588 |
| Acquisition Flow — Scarcity Mechanic | `saas-acquisition-flow.png` | 16:9 | ~6613 |
| Google Places API Autofill | `saas-google-places.png` | 4:3 (tall) | ~6623 |
| Magic Link Auth Screen | `saas-magic-link.png` | 4:3 (tall) | ~6623 |
| Scheduling Engine — Midnight Threshold Diagram | `saas-scheduling-engine.png` | 16:9 | ~6637 |
| Live Override Management Card | `saas-live-override.png` | 16:9 | ~6641 |

### Consumer App  (case study in index.html)
| Placeholder label | Suggested filename | Ratio | img() line |
|---|---|---|---|
| Consumer App — Live Real-Time Feed | `consumer-live-feed.png` | 16:9 | ~6656 |
| Consumer App — Live Real-Time Feed (2) | `consumer-live-feed-2.png` | 16:9 | ~6680 |
| Consumer App — Geolocation Check-In State | `consumer-geolocation.png` | 16:9 | ~6690 |

(Line numbers drift as you edit — search by the label text to be safe.)
