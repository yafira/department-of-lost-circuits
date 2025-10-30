/* Department of Lost Circuits — stamp grid generator
   - 5×4 grid (20 stamps) on 8×10" @ 300ppi (2400×3000) per sheet
   - Keys: s=save, r=reseed, ←/→ navigate, l=RISO preview, e=export plates
*/

//// Canvas & Grid /////////////////////////////////////////////////////////////
const CANVAS_W = 2400,
	CANVAS_H = 3000;
const COLS = 5,
	ROWS = 4;
const MARGIN = 100,
	GUTTER = 60;
const STAMP_INSET = 18;

//// Layout constants //////////////////////////////////////////////////////////
const FRAME_PAD = 12; // distance from stamp edge to outer frame
const INNER_INSET = 5; // offset from outer to inner frame
const PRICE_D = 50; // price circle diameter
const BADGE = 32; // category icon size
const STAR_Y_OFFSET = 70; // below inner top
const STAMP_BG = 248; // unified paper tone for stamp & image box

// ⬇️ Text readability tweaks (centralized sizes + spacing)
const TXT_NAME_1 = 22;
const TXT_NAME_2 = 18;
const TXT_YEARS = 15;
const TXT_META = 12; // region • mfg
const TXT_FORM = 11; // form factor
const TXT_REASON = 10; // reason lines
const TXT_REASON_LINE_GAP = 12;

// ⬇️ Make images breathe less (smaller white space around images)
const IMG_MARGIN = 32; // was 45
const IMG_TEXT_FOOTER = 140; // was 150 (gives a touch more image height)

//// RISO (lazy init) //////////////////////////////////////////////////////////
let USE_RISO = false; // toggle with 'L' (only if risoReady())
let L_BLACK = null,
	L_TEAL = null;
const TEAL_NAME = 'TEAL'; // choose 'TEAL' or other ink names
let SHOW_TRACES = true; // press 'C' to toggle

function risoReady() {
	return typeof Riso !== 'undefined';
}
function ensureRisoLayers() {
	if (!risoReady()) return false;
	if (!L_BLACK || !L_TEAL) {
		L_BLACK = new Riso('BLACK');
		L_TEAL = new Riso(TEAL_NAME);
	}
	return true;
}

// Auto-levels before dither (percentile clip + gamma)
const LEVELS_CLIP_LOW = 0.05; // 5th percentile → black
const LEVELS_CLIP_HIGH = 0.95; // 95th percentile → white
const LEVELS_GAMMA = 0.95; // <1.0 = a bit more contrast

// Dither controls
const DITHER_GAIN = 1.15; // already present; 1.05–1.30
const DITHER_BIAS = -8; // already present; -20..+10
const DITHER_MATRIX = '8x8'; // '4x4' or '8x8' (smoother)

//// Globals ///////////////////////////////////////////////////////////////////
let table,
	devices = [],
	images = {};
let grid;
let sheetIndex = 0,
	baseSeed = 1337;

// ⬇️ Robust image loading state
let imagesToLoad = 0;
let imagesLoaded = 0;
let imagesFailed = 0;

//// Helpers: inner frame rect /////////////////////////////////////////////////
function getInnerFrame(x, y, w, h) {
	const bx = x + FRAME_PAD;
	const by = y + FRAME_PAD;
	const bw = w - FRAME_PAD * 2;
	const bh = h - FRAME_PAD * 2;
	return {
		ix: bx + INNER_INSET + 5,
		iy: by + INNER_INSET + 5,
		iw: bw - (INNER_INSET + 5) * 2,
		ih: bh - (INNER_INSET + 5) * 2,
	};
}

//// PRELOAD & SETUP ///////////////////////////////////////////////////////////
function preload() {
	table = loadTable('devices.csv', 'csv', 'header');
}

function setup() {
	pixelDensity(1);
	const cnv = createCanvas(CANVAS_W, CANVAS_H);
	cnv.parent('canvas-container'); // ensure visible in the page

	if (!table || table.getRowCount() === 0) {
		console.error('CSV missing or empty');
		return;
	}

	// Build device records + queue images
	for (let r = 0; r < table.getRowCount(); r++) {
		const row = table.getRow(r);

		// Parse years
		const yrsRaw = (row.getString('years_active') || '').toLowerCase().trim();
		const yrs = yrsRaw.replace(/[—–]/g, '-').replace(/\s+/g, ' ');
		const m = yrs.match(/(\d{4})\s*-\s*(\d{4}|present)/);
		let release_year = NaN,
			discontinued = NaN;
		if (m) {
			release_year = int(m[1]);
			discontinued = m[2] === 'present' ? int(m[1]) : int(m[2]);
		} else {
			const yy = yrs.match(/\d{4}/g);
			if (yy && yy.length) release_year = int(yy[0]);
			if (yy && yy.length > 1) discontinued = int(yy[1]);
		}
		if (!isNaN(release_year) && isNaN(discontinued))
			discontinued = release_year;

		// Price
		const priceRaw = row.getString('original_price') || '';
		const priceMatch = priceRaw.match(/[\d,]+/);
		const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;

		// Units
		const unitsRaw = row.getString('units_sold') || '';
		const unitsMatch = unitsRaw.match(/[\d,]+/);
		const units_sold = unitsMatch
			? parseInt(unitsMatch[0].replace(/,/g, ''))
			: 0;

		const rec = {
			id: row.getString('name') || String(r + 1),
			name: row.getString('name') || `Device ${r + 1}`,
			category: row.getString('category') || '',
			region: row.getString('region') || '',
			manufacturer: row.getString('manufacturer') || '',
			original_price: priceRaw,
			price_value: price,
			units_sold_raw: unitsRaw,
			units_sold,
			availability_today: row.getString('availability_today') || '',
			connectivity: row.getString('connectivity') || '',
			form_factor: row.getString('form_factor') || '',
			reason_for_obsolescence: row.getString('reason_for_obsolescence') || '',
			release_year,
			discontinued,
			image_path: (row.getString('image_path') || '').trim(),
		};
		devices.push(rec);

		// Queue image loading (count + redraw when all done)
		if (rec.image_path && !images[rec.image_path]) {
			imagesToLoad++;
			images[rec.image_path] = loadImage(
				rec.image_path,
				() => {
					imagesLoaded++;
					if (imagesLoaded + imagesFailed === imagesToLoad) drawSheet();
				},
				(err) => {
					imagesFailed++;
					console.error('Image load failed:', rec.image_path, err);
					if (imagesLoaded + imagesFailed === imagesToLoad) drawSheet();
				}
			);
		}
	}

	// Grid
	const innerW = width - MARGIN * 2;
	const innerH = height - MARGIN * 2;
	grid = new EasyGrid({
		x: MARGIN,
		y: MARGIN,
		width: innerW,
		height: innerH,
		cols: COLS,
		rows: ROWS,
		gutterX: GUTTER,
		gutterY: GUTTER,
	});

	drawSheet();
}

function draw() {
	/* manual rendering */
}

//// MAIN SHEET RENDER /////////////////////////////////////////////////////////
function drawSheet() {
	if (!table || devices.length === 0 || !grid) {
		background(255);
		fill(0);
		textAlign(CENTER, CENTER);
		textSize(20);
		text('Loading...', width / 2, height / 2);
		return;
	}

	// If images are still loading, show a soft progress overlay and wait.
	if (imagesToLoad > 0 && imagesLoaded + imagesFailed < imagesToLoad) {
		background(255);
		fill(0);
		noStroke();
		textAlign(CENTER, CENTER);
		textSize(20);
		text(
			`Loading images ${imagesLoaded}/${imagesToLoad}…`,
			width / 2,
			height / 2
		);
		return;
	}

	const perSheet = COLS * ROWS;
	const start = sheetIndex * perSheet;
	const end = min(start + perSheet, devices.length);

	// RGB path (or when RISO not ready)
	if (!USE_RISO || !ensureRisoLayers()) {
		background(255);
		for (let i = start; i < end; i++) {
			const d = devices[i],
				idx = i - start;
			const col = idx % COLS,
				row = floor(idx / COLS);
			const cell = grid.getModule(col, row);
			const seed = hash(`${baseSeed}::${d.id}`);
			randomSeed(seed);
			noiseSeed(seed);
			drawStamp(d, cell.x, cell.y, cell.width, cell.height);
		}

		// Mode badge
		push();
		noStroke();
		fill(0, 120);
		rect(12, 12, 140, 28, 6);
		fill(255);
		textAlign(LEFT, CENTER);
		textSize(12);
		text('RGB PREVIEW', 22, 26);
		pop();
		return;
	}

	// RISO preview path
	background(245);
	clearRiso();

	drawRegistrationMarks(L_BLACK);
	drawRegistrationMarks(L_TEAL);

	for (let i = start; i < end; i++) {
		const d = devices[i],
			idx = i - start;
		const col = idx % COLS,
			row = floor(idx / COLS);
		const cell = grid.getModule(col, row);
		const seed = hash(`${baseSeed}::${d.id}`);
		randomSeed(seed);
		noiseSeed(seed);
		drawStampRiso(d, cell.x, cell.y, cell.width, cell.height);
	}
	drawRiso();

	// Mode badge
	push();
	noStroke();
	fill(0, 180);
	rect(12, 12, 190, 28, 6);
	fill(255);
	textAlign(LEFT, CENTER);
	textSize(12);
	text('RISO: BLACK + TEAL', 22, 26);
	pop();
}

//// ONE STAMP (RGB) ///////////////////////////////////////////////////////////
function drawStamp(d, x, y, w, h) {
	push();
	// stamp panel
	fill(STAMP_BG);
	noStroke();
	rect(
		x + STAMP_INSET,
		y + STAMP_INSET,
		w - STAMP_INSET * 2,
		h - STAMP_INSET * 2
	);

	// content
	drawCircuits(d, x, y, w, h);
	drawImage(d, x, y, w, h);

	// Border (varies per stamp)
	const borderStyle = pickBorderStyle();
	drawBorder(d, x, y, w, h, borderStyle);

	// Marks
	drawPriceStamp(d, x, y, w, h);
	drawRarityStars(d, x, y, w, h);
	drawCategoryBadge(d, x, y, w, h);
	drawText(d, x, y, w, h);

	pop();
}

//// ONE STAMP (RISO) //////////////////////////////////////////////////////////
function drawStampRiso(d, x, y, w, h) {
	// Paper panel (screen only to see the card)
	push();
	noStroke();
	fill(STAMP_BG);
	rect(
		x + STAMP_INSET,
		y + STAMP_INSET,
		w - STAMP_INSET * 2,
		h - STAMP_INSET * 2
	);
	pop();

	// Create a PG for BLACK content and render
	const pgBlack = createGraphics(width, height);
	pgBlack.pixelDensity(1);

	// Circuits / Border / Price / Stars / Badge / Text into pgBlack
	drawCircuits_toPG(pgBlack, d, x, y, w, h);

	const style = pickBorderStyle(); // seeded already → deterministic
	drawBorder_toPG(pgBlack, d, x, y, w, h, style);
	drawPriceStamp_toPG(pgBlack, d, x, y, w, h);
	drawRarityStars_toPG(pgBlack, d, x, y, w, h);
	drawCategoryBadge_toPG(pgBlack, d, x, y, w, h);
	drawText_toPG(pgBlack, d, x, y, w, h);

	L_BLACK.image(pgBlack, 0, 0);

	// TEAL dithered image
	drawImageHalftone_toLayer(L_TEAL, d, x, y, w, h);
}

//// BORDER VARIETY (RGB) //////////////////////////////////////////////////////
function pickBorderStyle() {
	const styles = ['perforated', 'scalloped', 'zigzag', 'ticket'];
	return styles[floor(random(styles.length))];
}
function drawBorder(d, x, y, w, h, style = 'perforated') {
	const bx = x + FRAME_PAD;
	const by = y + FRAME_PAD;
	const bw = w - FRAME_PAD * 2;
	const bh = h - FRAME_PAD * 2;

	// outer frame
	push();
	noFill();
	stroke(0);
	strokeWeight(3);
	rect(bx, by, bw, bh, 3);
	pop();

	// inner frame
	push();
	noFill();
	stroke(0);
	strokeWeight(1.5);
	rect(
		bx + INNER_INSET + 5,
		by + INNER_INSET + 5,
		bw - (INNER_INSET + 5) * 2,
		bh - (INNER_INSET + 5) * 2,
		3
	);
	pop();

	// decorative edge
	if (style === 'perforated') {
		const step = 16,
			r = 7,
			inset = 5;
		push();
		noFill();
		stroke(255);
		strokeWeight(8);
		for (let px = bx + step; px < bx + bw; px += step) {
			arc(px, by + inset, r * 2, r * 2, PI, TWO_PI);
			arc(px, by + bh - inset, r * 2, r * 2, 0, PI);
		}
		for (let py = by + step; py < by + bh; py += step) {
			arc(bx + inset, py, r * 2, r * 2, HALF_PI, 3 * HALF_PI);
			arc(bx + bw - inset, py, r * 2, r * 2, -HALF_PI, HALF_PI);
		}
		pop();
	} else if (style === 'scalloped') {
		// Smooth round scalloped edges (like the reference image)
		const step = 22;
		const r = 10;
		noFill();
		stroke(0);
		strokeWeight(2);
		// top & bottom
		for (let px = bx; px < bx + bw; px += step) {
			arc(px + step / 2, by, step, step, PI, TWO_PI);
			arc(px + step / 2, by + bh, step, step, 0, PI);
		}
		// left & right
		for (let py = by; py < by + bh; py += step) {
			arc(bx, py + step / 2, step, step, HALF_PI, 3 * HALF_PI);
			arc(bx + bw, py + step / 2, step, step, -HALF_PI, HALF_PI);
		}
		pop();
	} else if (style === 'zigzag') {
		const step = 14,
			tri = 6;
		push();
		noStroke();
		fill(0);
		for (let px = bx; px < bx + bw; px += step) {
			triangle(px, by, px + step / 2, by - tri, px + step, by);
			triangle(px, by + bh, px + step / 2, by + bh + tri, px + step, by + bh);
		}
		for (let py = by; py < by + bh; py += step) {
			triangle(bx, py, bx - tri, py + step / 2, bx, py + step);
			triangle(bx + bw, py, bx + bw + tri, py + step / 2, bx + bw, py + step);
		}
		pop();
	} else if (style === 'ticket') {
		const notch = 14;
		push();
		noFill();
		stroke(255);
		strokeWeight(10);
		arc(bx, by + bh / 2, notch * 2, notch * 2, -HALF_PI, HALF_PI);
		arc(bx + bw, by + bh / 2, notch * 2, notch * 2, HALF_PI, -HALF_PI);
		arc(bx + bw / 2, by, notch * 2, notch * 2, 0, PI);
		arc(bx + bw / 2, by + bh, notch * 2, notch * 2, PI, 0);
		pop();
	}

	// corner ticks
	const tick = 18;
	push();
	stroke(0);
	strokeWeight(1.5);
	line(bx, by, bx + tick, by);
	line(bx, by, bx, by + tick);
	line(bx + bw, by, bx + bw - tick, by);
	line(bx + bw, by, bx + bw, by + tick);
	line(bx, by + bh, bx + tick, by + bh);
	line(bx, by + bh, bx, by + bh - tick);
	line(bx + bw, by + bh, bx + bw - tick, by + bh);
	line(bx + bw, by + bh, bx + bw, by + bh - tick);
	pop();
}

//// CIRCUITS (RGB) ////////////////////////////////////////////////////////////
function drawCircuits(d, x, y, w, h) {
	if (!SHOW_TRACES) return;
	const yr = isNaN(d.release_year)
		? 1990
		: constrain(d.release_year, 1960, 2020);
	const baseLines = floor(map(yr, 1960, 2020, 18, 7)); // fewer
	const { ix, iy, iw, ih } = getInnerFrame(x, y, w, h);

	// carve out a soft “no-print” zone for text/footer
	const footerTop = y + h - 150; // matches your text block
	push();
	noFill();
	stroke(0, 35); // ~14% black on screen
	strokeWeight(1.2);
	for (let i = 0; i < baseLines; i++) {
		let px = random(ix, ix + iw),
			py = random(iy, iy + ih - 60); // keep away from price/stars row
		beginShape();
		vertex(px, py);
		for (let s = 0; s < 3; s++) {
			// fewer segments
			const step = random(22, 42),
				dir = floor(random(4));
			if (dir === 0) px += step;
			else if (dir === 1) px -= step;
			else if (dir === 2) py += step;
			else py -= step;

			// constrain inside inner frame and above footer/text
			px = constrain(px, ix, ix + iw);
			py = constrain(py, iy, min(iy + ih - 70, footerTop - 8));
			vertex(px, py);
		}
		endShape();
	}
	pop();
}

//// IMAGE (RGB) ///////////////////////////////////////////////////////////////
function drawImage(d, x, y, w, h) {
	const margin = IMG_MARGIN;
	const imgX = x + STAMP_INSET + margin;
	const imgY = y + STAMP_INSET + margin;
	const imgW = w - (STAMP_INSET + margin) * 2;
	const imgH = h - (STAMP_INSET + margin) * 2 - IMG_TEXT_FOOTER;

	// unified paper behind PNGs
	push();
	fill(STAMP_BG);
	noStroke();
	rect(imgX, imgY, imgW, imgH);
	pop();

	const img = d.image_path ? images[d.image_path] : null;
	if (img && img.width > 0) {
		const imgRatio = img.width / img.height;
		const boxRatio = imgW / imgH;
		let drawW, drawH;
		if (imgRatio > boxRatio) {
			drawW = imgW;
			drawH = imgW / imgRatio;
		} else {
			drawH = imgH;
			drawW = imgH * imgRatio;
		}
		const cx = imgX + (imgW - drawW) / 2;
		const cy = imgY + (imgH - drawH) / 2;
		image(img, cx, cy, drawW, drawH);
	}
}

//// PRICE / STARS / BADGE (RGB) ///////////////////////////////////////////////
function drawPriceStamp(d, x, y, w, h) {
	if (d.price_value === 0) return;
	const { ix, iy, iw } = getInnerFrame(x, y, w, h);
	const cx = ix + iw - PRICE_D / 2;
	const cy = iy + PRICE_D / 2;

	let displayPrice = '$?';
	if (d.original_price) {
		const m = d.original_price.match(/(\D*)(\d+(?:[,\d]*)?)/);
		if (m) {
			const currency = (m[1] || '$').trim() || '$';
			const amount = parseInt(m[2].replace(/,/g, ''));
			displayPrice =
				amount >= 1000
					? currency + (amount / 1000).toFixed(1) + 'K'
					: currency + amount;
		}
	}

	push();
	fill(255);
	stroke(0);
	strokeWeight(3);
	circle(cx, cy, PRICE_D);
	noFill();
	strokeWeight(1);
	stroke(0, 150);
	circle(cx, cy, PRICE_D - 8);
	pop();

	push();
	fill(0);
	noStroke();
	textAlign(CENTER, CENTER);
	textSize(16);
	textStyle(BOLD);
	text(displayPrice, cx, cy - 3);
	if (!isNaN(d.release_year)) {
		textSize(8);
		textStyle(NORMAL);
		fill(0, 200);
		text(d.release_year, cx, cy + 9);
	}
	pop();
}

function drawRarityStars(d, x, y, w, h) {
	if (!d.availability_today) return;

	const avail = d.availability_today.toLowerCase();
	let stars = 2;
	if (avail.includes('very rare')) stars = 5;
	else if (avail.includes('rare')) stars = 4;
	else if (avail.includes('uncommon')) stars = 3;

	const { ix, iy, iw } = getInnerFrame(x, y, w, h);
	const starSize = 10,
		spacing = 12;
	const startX = ix + iw - 30 - stars * spacing;
	const startY = iy + STAR_Y_OFFSET;

	push();
	fill(220, 180, 50);
	noStroke();
	for (let i = 0; i < stars; i++)
		drawStar(startX + i * spacing, startY, starSize * 0.5, starSize * 0.2, 5);
	pop();
}
function drawStar(x, y, r1, r2, n) {
	beginShape();
	for (let i = 0; i < n * 2; i++) {
		const a = (TWO_PI / (n * 2)) * i - HALF_PI;
		const r = i % 2 === 0 ? r1 : r2;
		vertex(x + cos(a) * r, y + sin(a) * r);
	}
	endShape(CLOSE);
}

function drawCategoryBadge(d, x, y, w, h) {
	const cat = (d.category || '').split('/')[0].trim().toLowerCase();
	const { ix, iy, iw, ih } = getInnerFrame(x, y, w, h);

	const bx = ix + iw - BADGE;
	const by = iy + ih - BADGE;

	push();
	fill(250);
	noStroke();
	rect(bx - 6, by - 6, BADGE + 12, BADGE + 12, 8);
	pop();
	push();
	translate(bx + BADGE / 2, by + BADGE / 2);
	noFill();
	stroke(0);
	strokeWeight(2.5);

	if (cat.includes('audio')) {
		circle(0, 0, 22);
		line(-10, 0, 10, 0);
	} else if (cat.includes('storage')) {
		rectMode(CENTER);
		rect(0, 0, 22, 22, 2);
	} else if (cat.includes('gaming')) {
		drawPoly(0, 0, 11, 5);
	} else if (
		cat.includes('computing') ||
		cat.includes('computer') ||
		cat.includes('laptop')
	) {
		drawPoly(0, 0, 11, 6);
	} else if (cat.includes('camera')) {
		circle(0, 0, 20);
		circle(0, 0, 12);
	} else if (cat.includes('mobile') || cat.includes('phone')) {
		rectMode(CENTER);
		rect(0, 0, 14, 24, 3);
	} else {
		circle(0, 0, 20);
	}
	pop();
}
function drawPoly(x, y, r, n) {
	beginShape();
	for (let i = 0; i < n; i++) {
		const a = -HALF_PI + TWO_PI * (i / n);
		vertex(x + cos(a) * r, y + sin(a) * r);
	}
	endShape(CLOSE);
}

//// TEXT (RGB) ////////////////////////////////////////////////////////////////
function drawText(d, x, y, w, h) {
	const cx = x + w / 2;
	const baseY = y + h - 130;
	const maxWidth = w - 70;

	push();
	noStroke();

	// name
	textAlign(CENTER, CENTER);
	fill(0);
	textStyle(BOLD);
	textSize(TXT_NAME_1);
	const nameLines = wrapText(d.name, maxWidth, TXT_NAME_1);
	text(nameLines[0], cx, baseY);
	if (nameLines.length > 1) {
		textSize(TXT_NAME_2);
		text(nameLines[1], cx, baseY + 22);
	}

	// years
	textStyle(NORMAL);
	textSize(TXT_YEARS);
	const yrs =
		!isNaN(d.release_year) && !isNaN(d.discontinued)
			? `${d.release_year}–${d.discontinued}`
			: !isNaN(d.release_year)
			? `${d.release_year}`
			: '';
	text(yrs, cx, baseY + 46);

	// region • mfg
	textSize(TXT_META);
	fill(30); // darker for contrast
	const region = d.region || '',
		mfg = d.manufacturer || '';
	text(region && mfg ? `${region} • ${mfg}` : region || mfg, cx, baseY + 64);

	// form factor
	textSize(TXT_FORM);
	textStyle(ITALIC);
	fill(50);
	if (d.form_factor) text(d.form_factor, cx, baseY + 82);

	// reason (wrap to ≤3 lines, centered)
	textStyle(NORMAL);
	textSize(TXT_REASON);
	fill(60);
	if (d.reason_for_obsolescence) {
		const words = d.reason_for_obsolescence.trim().split(/\s+/);
		const boxW = maxWidth,
			maxLines = 3,
			lineGap = TXT_REASON_LINE_GAP,
			startY = baseY + 98;

		textAlign(LEFT, TOP);
		let lines = [],
			cur = '';
		for (let i = 0; i < words.length; i++) {
			const test = cur ? cur + ' ' + words[i] : words[i];
			if (textWidth(test) <= boxW) cur = test;
			else {
				lines.push(cur);
				cur = words[i];
				if (lines.length === maxLines - 1) break;
			}
		}
		if (lines.length < maxLines && cur) lines.push(cur);

		textAlign(CENTER, TOP);
		for (let i = 0; i < lines.length; i++)
			text(lines[i], cx, startY + i * lineGap);
	}
	pop();
}
function wrapText(str, maxW, sizePx) {
	textSize(sizePx || TXT_NAME_1);
	if (textWidth(str) <= maxW) return [str];
	const words = str.split(/\s+/);
	let line1 = '',
		line2 = '',
		split = false;
	for (let w of words) {
		const t = line1 ? line1 + ' ' + w : w;
		if (!split && textWidth(t) <= maxW) line1 = t;
		else {
			split = true;
			line2 += (line2 ? ' ' : '') + w;
		}
	}
	return line2 ? [line1, line2] : [line1];
}

//// PG WRAPPERS FOR RISO BLACK ///////////////////////////////////////////////
function drawCircuits_toPG(g, d, x, y, w, h) {
	if (!SHOW_TRACES) return;
	g.stroke(0, 180); // lighter on plate so it doesn’t overpower teal

	const yr = isNaN(d.release_year)
		? 1990
		: constrain(d.release_year, 1960, 2020);
	const numLines = floor(map(yr, 1960, 2020, 25, 8));
	const { ix, iy, iw, ih } = getInnerFrame(x, y, w, h);
	g.noFill();
	g.stroke(0, 220);
	g.strokeWeight(1.5);
	for (let i = 0; i < numLines; i++) {
		let px = random(ix, ix + iw),
			py = random(iy, iy + ih);
		g.beginShape();
		g.vertex(px, py);
		for (let s = 0; s < 4; s++) {
			const step = random(20, 45),
				dir = floor(random(4));
			if (dir === 0) px += step;
			else if (dir === 1) px -= step;
			else if (dir === 2) py += step;
			else py -= step;
			px = constrain(px, ix, ix + iw);
			py = constrain(py, iy, iy + ih);
			g.vertex(px, py);
		}
		g.endShape();
	}
}

function drawBorder_toPG(g, d, x, y, w, h, style = 'perforated') {
	const bx = x + FRAME_PAD,
		by = y + FRAME_PAD;
	const bw = w - FRAME_PAD * 2,
		bh = h - FRAME_PAD * 2;

	g.noFill();
	g.stroke(0);
	g.strokeWeight(3);
	g.rect(bx, by, bw, bh, 3);
	g.strokeWeight(1.5);
	g.rect(
		bx + INNER_INSET + 5,
		by + INNER_INSET + 5,
		bw - (INNER_INSET + 5) * 2,
		bh - (INNER_INSET + 5) * 2,
		3
	);

	if (style === 'perforated') {
		const step = 16,
			r = 7,
			inset = 5;
		g.noFill();
		g.stroke(255);
		g.strokeWeight(8);
		for (let px = bx + step; px < bx + bw; px += step) {
			g.arc(px, by + inset, r * 2, r * 2, PI, TWO_PI);
			g.arc(px, by + bh - inset, r * 2, r * 2, 0, PI);
		}
		for (let py = by + step; py < by + bh; py += step) {
			g.arc(bx + inset, py, r * 2, r * 2, HALF_PI, 3 * HALF_PI);
			g.arc(bx + bw - inset, py, r * 2, r * 2, -HALF_PI, HALF_PI);
		}
	} else if (style === 'scalloped') {
		const step = 18,
			r = 6;
		g.noStroke();
		g.fill(255);
		for (let px = bx; px <= bx + bw; px += step) {
			g.circle(px, by, r * 2);
			g.circle(px, by + bh, r * 2);
		}
		for (let py = by; py <= by + bh; py += step) {
			g.circle(bx, py, r * 2);
			g.circle(bx + bw, py, r * 2);
		}
	} else if (style === 'zigzag') {
		const step = 14,
			tri = 6;
		g.noStroke();
		g.fill(0);
		for (let px = bx; px < bx + bw; px += step) {
			g.triangle(px, by, px + step / 2, by - tri, px + step, by);
			g.triangle(px, by + bh, px + step / 2, by + bh + tri, px + step, by + bh);
		}
		for (let py = by; py < by + bh; py += step) {
			g.triangle(bx, py, bx - tri, py + step / 2, bx, py + step);
			g.triangle(bx + bw, py, bx + bw + tri, py + step / 2, bx + bw, py + step);
		}
	} else if (style === 'ticket') {
		const notch = 14;
		g.noFill();
		g.stroke(255);
		g.strokeWeight(10);
		g.arc(bx, by + bh / 2, notch * 2, notch * 2, -HALF_PI, HALF_PI);
		g.arc(bx + bw, by + bh / 2, notch * 2, notch * 2, HALF_PI, -HALF_PI);
		g.arc(bx + bw / 2, by, notch * 2, notch * 2, 0, PI);
		g.arc(bx + bw / 2, by + bh, notch * 2, notch * 2, PI, 0);
	}

	// corner ticks
	const tick = 18;
	g.stroke(0);
	g.strokeWeight(1.5);
	g.line(bx, by, bx + tick, by);
	g.line(bx, by, bx, by + tick);
	g.line(bx + bw, by, bx + bw - tick, by);
	g.line(bx + bw, by, bx + bw, by + tick);
	g.line(bx, by + bh, bx + tick, by + bh);
	g.line(bx, by + bh, bx, by + bh - tick);
	g.line(bx + bw, by + bh, bx + bw - tick, by + bh);
	g.line(bx + bw, by + bh, bx + bw, by + bh - tick);
}

function drawPriceStamp_toPG(g, d, x, y, w, h) {
	if (d.price_value === 0) return;
	const { ix, iy, iw } = getInnerFrame(x, y, w, h);
	const cx = ix + iw - PRICE_D / 2,
		cy = iy + PRICE_D / 2;
	let txt = '$?';
	if (d.original_price) {
		const m = d.original_price.match(/(\D*)(\d+(?:[,\d]*)?)/);
		if (m) {
			const currency = (m[1] || '$').trim() || '$';
			const amount = parseInt(m[2].replace(/,/g, ''));
			txt =
				amount >= 1000
					? currency + (amount / 1000).toFixed(1) + 'K'
					: currency + amount;
		}
	}
	g.fill(255);
	g.stroke(0);
	g.strokeWeight(3);
	g.circle(cx, cy, PRICE_D);
	g.noFill();
	g.strokeWeight(1);
	g.stroke(0, 150);
	g.circle(cx, cy, PRICE_D - 8);
	g.noStroke();
	g.fill(0);
	g.textAlign(CENTER, CENTER);
	g.textSize(16);
	g.textStyle(BOLD);
	g.text(txt, cx, cy - 3);
	if (!isNaN(d.release_year)) {
		g.textSize(8);
		g.textStyle(NORMAL);
		g.text(d.release_year, cx, cy + 9);
	}
}

function drawRarityStars_toPG(g, d, x, y, w, h) {
	if (!d.availability_today) return;
	const avail = d.availability_today.toLowerCase();
	let stars = 2;
	if (avail.includes('very rare')) stars = 5;
	else if (avail.includes('rare')) stars = 4;
	else if (avail.includes('uncommon')) stars = 3;
	const { ix, iy, iw } = getInnerFrame(x, y, w, h);
	const size = 10,
		spacing = 12;
	const startX = ix + iw - 30 - stars * spacing,
		startY = iy + STAR_Y_OFFSET;
	g.noStroke();
	g.fill(0);
	for (let i = 0; i < stars; i++)
		drawStar_onPG(g, startX + i * spacing, startY, size * 0.5, size * 0.2, 5);
}
function drawStar_onPG(g, x, y, r1, r2, n) {
	g.beginShape();
	for (let i = 0; i < n * 2; i++) {
		const a = (TWO_PI / (n * 2)) * i - HALF_PI;
		const r = i % 2 === 0 ? r1 : r2;
		g.vertex(x + cos(a) * r, y + sin(a) * r);
	}
	g.endShape(CLOSE);
}

function drawCategoryBadge_toPG(g, d, x, y, w, h) {
	const cat = (d.category || '').split('/')[0].trim().toLowerCase();
	const { ix, iy, iw, ih } = getInnerFrame(x, y, w, h);
	const bx = ix + iw - BADGE,
		by = iy + ih - BADGE;

	g.noFill();
	g.stroke(0);
	g.strokeWeight(2.5);
	g.push();
	g.translate(bx + BADGE / 2, by + BADGE / 2);
	if (cat.includes('audio')) {
		g.circle(0, 0, 22);
		g.line(-10, 0, 10, 0);
	} else if (cat.includes('storage')) {
		g.rectMode(CENTER);
		g.rect(0, 0, 22, 22, 2);
	} else if (cat.includes('gaming')) {
		drawPoly_onPG(g, 0, 0, 11, 5);
	} else if (
		cat.includes('computing') ||
		cat.includes('computer') ||
		cat.includes('laptop')
	) {
		drawPoly_onPG(g, 0, 0, 11, 6);
	} else if (cat.includes('camera')) {
		g.circle(0, 0, 20);
		g.circle(0, 0, 12);
	} else if (cat.includes('mobile') || cat.includes('phone')) {
		g.rectMode(CENTER);
		g.rect(0, 0, 14, 24, 3);
	} else {
		g.circle(0, 0, 20);
	}
	g.pop();
}
function drawPoly_onPG(g, x, y, r, n) {
	g.beginShape();
	for (let i = 0; i < n; i++) {
		const a = -HALF_PI + TWO_PI * (i / n);
		g.vertex(x + cos(a) * r, y + sin(a) * r);
	}
	g.endShape(CLOSE);
}

function drawText_toPG(g, d, x, y, w, h) {
	const cx = x + w / 2,
		baseY = y + h - 130,
		maxWidth = w - 70;
	g.noStroke();

	g.textAlign(CENTER, CENTER);
	g.fill(0);
	g.textStyle(BOLD);
	g.textSize(TXT_NAME_1);
	const nameLines = wrapText(d.name, maxWidth, TXT_NAME_1);
	g.text(nameLines[0], cx, baseY);
	if (nameLines.length > 1) {
		g.textSize(TXT_NAME_2);
		g.text(nameLines[1], cx, baseY + 22);
	}

	g.textStyle(NORMAL);
	g.textSize(TXT_YEARS);
	const yrs =
		!isNaN(d.release_year) && !isNaN(d.discontinued)
			? `${d.release_year}–${d.discontinued}`
			: !isNaN(d.release_year)
			? `${d.release_year}`
			: '';
	g.text(yrs, cx, baseY + 46);

	g.textSize(TXT_META);
	const region = d.region || '',
		mfg = d.manufacturer || '';
	g.text(region && mfg ? `${region} • ${mfg}` : region || mfg, cx, baseY + 64);

	g.textSize(TXT_FORM);
	g.textStyle(ITALIC);
	if (d.form_factor) g.text(d.form_factor, cx, baseY + 82);

	g.textStyle(NORMAL);
	g.textSize(TXT_REASON);
	if (d.reason_for_obsolescence) {
		const words = d.reason_for_obsolescence.trim().split(/\s+/);
		const boxW = maxWidth,
			maxLines = 3,
			lineGap = TXT_REASON_LINE_GAP,
			startY = baseY + 98;
		g.textAlign(LEFT, TOP);
		let lines = [],
			cur = '';
		for (let i = 0; i < words.length; i++) {
			const test = cur ? cur + ' ' + words[i] : words[i];
			if (g.textWidth(test) <= boxW) cur = test;
			else {
				lines.push(cur);
				cur = words[i];
				if (lines.length === maxLines - 1) break;
			}
		}
		if (lines.length < maxLines && cur) lines.push(cur);
		g.textAlign(CENTER, TOP);
		for (let i = 0; i < lines.length; i++)
			g.text(lines[i], cx, startY + i * lineGap);
	}
}

//// TEAL PLATE (Bayer dither) ////////////////////////////////////////////////
function drawImageHalftone_toLayer(layer, d, x, y, w, h) {
	const margin = IMG_MARGIN;
	const imgX = x + STAMP_INSET + margin;
	const imgY = y + STAMP_INSET + margin;
	const imgW = w - (STAMP_INSET + margin) * 2;
	const imgH = h - (STAMP_INSET + margin) * 2 - IMG_TEXT_FOOTER;

	const img = d.image_path ? images[d.image_path] : null;
	if (!img || img.width === 0) return;

	// Fit to box
	const imgRatio = img.width / img.height;
	const boxRatio = imgW / imgH;
	let drawW, drawH;
	if (imgRatio > boxRatio) {
		drawW = imgW;
		drawH = imgW / imgRatio;
	} else {
		drawH = imgH;
		drawW = imgH * imgRatio;
	}

	const cx = imgX + (imgW - drawW) / 2;
	const cy = imgY + (imgH - drawH) / 2;

	// Render source with paper tone behind transparent PNGs
	const src = createGraphics(drawW, drawH);
	src.pixelDensity(1);
	src.background(STAMP_BG);
	src.image(img, 0, 0, drawW, drawH);

	// Normalize contrast: auto-levels + gentle gamma
	const leveled = autoLevelsGray(
		src,
		LEVELS_CLIP_LOW,
		LEVELS_CLIP_HIGH,
		LEVELS_GAMMA
	);

	// Dither (Bayer 4x4 or 8x8), with global gain/bias
	const dithered =
		DITHER_MATRIX === '8x8'
			? bayerDither8x8(leveled, DITHER_GAIN, DITHER_BIAS)
			: bayerDither4x4(leveled, DITHER_GAIN, DITHER_BIAS);

	// Place onto TEAL plate
	layer.image(dithered.get(), cx, cy);
}

// 4×4 Bayer dither helper
function bayerDither4x4(pg, gain = 1.0, bias = 0) {
	// 4x4 Bayer threshold matrix (0..15)
	const M = [
		[0, 8, 2, 10],
		[12, 4, 14, 6],
		[3, 11, 1, 9],
		[15, 7, 13, 5],
	];
	const w = pg.width,
		h = pg.height;

	pg.loadPixels();

	const out = createGraphics(w, h);
	out.pixelDensity(1);
	out.loadPixels();

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const idx = 4 * (y * w + x);
			const r = pg.pixels[idx + 0];
			const g = pg.pixels[idx + 1];
			const b = pg.pixels[idx + 2];
			const a = pg.pixels[idx + 3];

			// Perceptual luminance
			let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

			// Apply gain/bias for plate contrast control
			lum = lum * gain + bias;
			if (lum < 0) lum = 0;
			else if (lum > 255) lum = 255;

			// Threshold from Bayer matrix scaled to 0..255
			const t = ((M[y & 3][x & 3] + 0.5) / 16) * 255;

			const v = lum > t ? 255 : 0; // 1-bit output

			out.pixels[idx + 0] = v;
			out.pixels[idx + 1] = v;
			out.pixels[idx + 2] = v;
			out.pixels[idx + 3] = a; // keep edges clean
		}
	}
	out.updatePixels();
	return out;
}

// ---- Auto-levels: clip low/high percentiles, convert to grayscale, apply gamma
function autoLevelsGray(pg, clipLow = 0.05, clipHigh = 0.95, gamma = 1.0) {
	const w = pg.width,
		h = pg.height;
	pg.loadPixels();

	// luminance histogram
	const hist = new Uint32Array(256);
	for (let i = 0; i < w * h; i++) {
		const idx = i * 4;
		const r = pg.pixels[idx],
			g = pg.pixels[idx + 1],
			b = pg.pixels[idx + 2];
		const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
		hist[lum]++;
	}
	// cumulative
	let cdf = new Uint32Array(256),
		sum = 0;
	for (let i = 0; i < 256; i++) {
		sum += hist[i];
		cdf[i] = sum;
	}
	const total = w * h;
	const loTarget = Math.max(
		0,
		Math.min(total - 1, Math.floor(total * clipLow))
	);
	const hiTarget = Math.max(
		0,
		Math.min(total - 1, Math.floor(total * clipHigh))
	);

	// find cutoffs
	let lo = 0,
		hi = 255;
	while (lo < 256 && cdf[lo] <= loTarget) lo++;
	while (hi >= 0 && cdf[hi] >= hiTarget) hi--;
	if (hi <= lo) {
		lo = 0;
		hi = 255;
	} // fallback

	const out = createGraphics(w, h);
	out.pixelDensity(1);
	out.loadPixels();

	const scale = 255 / (hi - lo);
	for (let i = 0; i < w * h; i++) {
		const idx = i * 4;
		const a = pg.pixels[idx + 3];

		const r = pg.pixels[idx],
			g = pg.pixels[idx + 1],
			b = pg.pixels[idx + 2];
		let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

		// levels
		let v = (lum - lo) * scale;
		if (v < 0) v = 0;
		else if (v > 255) v = 255;

		// gamma (in [0..1] space)
		v = Math.pow(v / 255, gamma) * 255;

		const val = Math.round(v);
		out.pixels[idx] = val;
		out.pixels[idx + 1] = val;
		out.pixels[idx + 2] = val;
		out.pixels[idx + 3] = a;
	}
	out.updatePixels();
	return out;
}

// ---- Bayer matrices
const BAYER_4x4 = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5],
];

const BAYER_8x8 = [
	[0, 32, 8, 40, 2, 34, 10, 42],
	[48, 16, 56, 24, 50, 18, 58, 26],
	[12, 44, 4, 36, 14, 46, 6, 38],
	[60, 28, 52, 20, 62, 30, 54, 22],
	[3, 35, 11, 43, 1, 33, 9, 41],
	[51, 19, 59, 27, 49, 17, 57, 25],
	[15, 47, 7, 39, 13, 45, 5, 37],
	[63, 31, 55, 23, 61, 29, 53, 21],
];

// ---- Dither functions (4x4 and 8x8), with gain/bias controls
function bayerDither4x4(pg, gain = 1.0, bias = 0) {
	return bayerDither(pg, BAYER_4x4, 16, gain, bias);
}
function bayerDither8x8(pg, gain = 1.0, bias = 0) {
	return bayerDither(pg, BAYER_8x8, 64, gain, bias);
}
function bayerDither(pg, matrix, denom, gain, bias) {
	const w = pg.width,
		h = pg.height;
	pg.loadPixels();
	const out = createGraphics(w, h);
	out.pixelDensity(1);
	out.loadPixels();
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const idx = 4 * (y * w + x);
			const a = pg.pixels[idx + 3];

			let v = pg.pixels[idx]; // already grayscale from autoLevelsGray
			v = v * gain + bias;
			if (v < 0) v = 0;
			else if (v > 255) v = 255;

			const t =
				((matrix[y % matrix.length][x % matrix.length] + 0.5) / denom) * 255;
			const outV = v > t ? 255 : 0;

			out.pixels[idx] = outV;
			out.pixels[idx + 1] = outV;
			out.pixels[idx + 2] = outV;
			out.pixels[idx + 3] = a;
		}
	}
	out.updatePixels();
	return out;
}

//// RISO: Registration / crop marks & export //////////////////////////////////
function drawRegistrationMarks(layer) {
	const m = 28,
		s = 14;
	const pts = [
		[m, m],
		[width - m, m],
		[m, height - m],
		[width - m, height - m],
	];
	layer.push();
	layer.stroke(0);
	layer.strokeWeight(2);
	for (const [x, y] of pts) {
		layer.line(x - s, y, x + s, y);
		layer.line(x, y - s, x, y + s);
	}
	const left = MARGIN - 10,
		top = MARGIN - 10,
		right = width - MARGIN + 10,
		bottom = height - MARGIN + 10;
	const t = 20;
	layer.line(left, top, left + t, top);
	layer.line(left, top, left, top + t);
	layer.line(right, top, right - t, top);
	layer.line(right, top, right, top + t);
	layer.line(left, bottom, left + t, bottom);
	layer.line(left, bottom, left, bottom - t);
	layer.line(right, bottom, right - t, bottom);
	layer.line(right, bottom, right, bottom - t);
	layer.pop();
}

function exportRiso() {
	// Save each plate separately; names include sheet index
	L_BLACK.save(`lost_circuits_sheet${sheetIndex + 1}_BLACK`);
	L_TEAL.save(`lost_circuits_sheet${sheetIndex + 1}_TEAL`);
}

//// UTIL //////////////////////////////////////////////////////////////////////
function hash(s) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = (h * 16777619) >>> 0;
	}
	return h;
}

//// INTERACTION ////////////////////////////////////////////////////////////////
function keyPressed() {
	if (key === 'c' || key === 'C') {
		SHOW_TRACES = !SHOW_TRACES;
		drawSheet();
	}
	if (key === 'r' || key === 'R') {
		baseSeed = floor(random(1e9));
		drawSheet();
	}
	if (key === 's' || key === 'S') {
		saveCanvas(`lost_circuits_sheet_${sheetIndex + 1}`, 'png');
	}
	if (keyCode === RIGHT_ARROW) {
		const ps = COLS * ROWS,
			total = max(1, ceil(devices.length / ps));
		sheetIndex = (sheetIndex + 1) % total;
		drawSheet();
	}
	if (keyCode === LEFT_ARROW) {
		const ps = COLS * ROWS,
			total = max(1, ceil(devices.length / ps));
		sheetIndex = (sheetIndex - 1 + total) % total;
		drawSheet();
	}

	if (key === 'l' || key === 'L') {
		if (!ensureRisoLayers()) {
			console.warn('p5.riso not loaded yet; staying in RGB preview.');
			// quick on-canvas toast
			push();
			fill(255, 30, 30);
			noStroke();
			rect(14, 14, 380, 36, 8);
			fill(255);
			textAlign(LEFT, CENTER);
			textSize(14);
			text('RISO not loaded yet — still in RGB preview', 24, 32);
			pop();
		} else {
			USE_RISO = !USE_RISO;
			console.log('RISO mode:', USE_RISO ? 'ON' : 'OFF');
		}
		drawSheet();
	}

	if (key === 'e' || key === 'E') {
		if (USE_RISO && ensureRisoLayers()) exportRiso();
		else
			console.warn(
				'Enable RISO (L) and ensure p5.riso is loaded before exporting.'
			);
	}
}
