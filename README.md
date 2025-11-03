# **Department of Lost Circuits**

*A Generative Print System for Obsolete Electronics*

### 🎴 **Department of Lost Circuits** is a p5.js-based design system that generates commemorative postage stamps for historically important but forgotten consumer electronics. Each stamp uses real product metadata and procedural rules to restore value to devices that have slipped into obscurity.
---

## ✿ Concept

Technology rarely disappears. It simply becomes invisible.
This project transforms obsolete devices — flip phones, MP3 players, pocket computers, failed form factors — into **tiny civic monuments**.

Each stamp reads like a micro-archival record:

* **Product name**
* **Release and discontinuation years**
* **Manufacturer and region**
* **Original price**
* **Category and form factor**
* **Reason for obsolescence**
* **Estimated rarity today**

Instead of e-waste, they become **memory artifacts**.

---

## ✿ System Overview

The system generates **20 stamps per sheet** in a 5 × 4 grid using **EasyGrid.js**.
Every stamp is layout-driven by its metadata:

| Input Data   | Output Design Logic      |
| ------------ | ------------------------ |
| Category     | Badge icon style         |
| Rarity       | Star count               |
| Release Year | Subtle scaling + spacing |
| Text Length  | Dynamic type wrapping    |
| Name Hash    | Unique border style      |

Small rules → a scalable visual identity.

---

## ✿ Printing + RISO

The project uses **p5.riso** for two-color separations:

* **Plate 1:** Black → typography + borders + icons
* **Plate 2:** Baby Blue or Teal → halftoned product images

Where fluorescent pink was tested, **purple overlap** emerged as a happy accident.

Halftoning uses the **Bayer matrix**, producing crisp dotted shading ideal for RISO:

```js
risoTeal.image(img, x, y, w, h, {
  halftone: "bayer",
  threshold: 128,
  levels: 3
});
```

Export workflow:

1. Press **L** → Toggle RISO mode
2. Press **E** → Export individual ink plates
3. Print on duplicator, then hand-cut stamps

Output size → `8 × 10 in @ 300 DPI` (2400 × 3000 px)

---

## ✿ Code Snippet

```js
function drawStamp(d, x, y, w, h) {
  const seed = hash(d.name);
  randomSeed(seed);

  drawImageHalftone(d, x, y, w, h);
  drawBorder(pickBorderStyle(), x, y, w, h);

  drawPrice(d, x, y, w, h);
  drawCategoryIcon(d, x, y, w, h);
  drawRarityStars(d, x, y, w, h);
  drawStampText(d, x, y, w, h);
}
```

(See `/scripts/sketch.js` for full implementation)

---

## ✿ Dataset

Custom-compiled dataset stored as:

```
/data/devices.csv
```

Fields:

```
name, manufacturer, release_year, discontinued_year,
price_usd, region, category, form_factor, availability, reason, image_path
```

---

## ✿ Controls

| Key       | Action                              |
| --------- | ----------------------------------- |
| `L`       | Toggle RISO preview mode            |
| `E`       | Export ink plates                   |
| `SPACE`   | Reseed border generation            |
| `→` / `←` | Cycle datasets (if multiple loaded) |

---

## ✿ Installation & Running Locally

```bash
git clone https://github.com/yafira/department-of-lost-circuits
cd department-of-lost-circuits
python3 -m http.server
```

Then visit:
`http://localhost:8000` in your browser.

Requires a local server because images must load securely.

---

## ✿ Future Improvements

* adhesive backs for real stamp functionality
* larger dataset (more device categories + regions)
* expanded iconography
* print shop template (perforation support)
* UI to browse and download individual stamps

---

## ✿ Credits & Inspiration

* Kate Compton — *So You Want to Build a Generator…*
  [https://www.galaxykate.com/so-you-want-to-build-a-generator/](https://www.galaxykate.com/so-you-want-to-build-a-generator/)

* International Design Systems — *Systematizing Byrne’s The Elements of Euclid*
  [https://designsystems.international/ideas/byrne-euclid-systematization/](https://designsystems.international/ideas/byrne-euclid-systematization/)

* Obsolete Tech Archive
  [https://www.obsoletetecharchive.com/](https://www.obsoletetecharchive.com/)

* Jenny Odell — *Bureau of Suspended Objects*
  [https://www.jennyodell.com/bso.html](https://www.jennyodell.com/bso.html)
