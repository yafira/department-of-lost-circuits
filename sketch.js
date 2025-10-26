/* Department of Lost Circuits — stamp generator
   - 5×4 grid (20 stamps) on 8×10" @ 300ppi (2400×3000)
   - s = save PNG (whole sheet)
   - r = reseed
   - ←/→ = prev/next sheet
*/

//// Canvas & Grid /////////////////////////////////////////////////////////////
const CANVAS_W = 2400,
	CANVAS_H = 3000;
const COLS = 5,
	ROWS = 4;
const MARGIN = 100,
	GUTTER = 60;
const STAMP_INSET = 18;
const STAMP_BG = 248; // unified paper tone for stamp + image box

//// Layout constants (align everything to the inner frame) ////////////////////
const FRAME_PAD = 12; // distance from stamp edge to outer frame
const INNER_INSET = 5; // offset from outer to inner frame
const PRICE_D = 50; // price circle diameter (try 44 if tight)
const BADGE = 32; // category icon size
const STAR_Y_OFFSET = 70; // below inner top

//// Globals ///////////////////////////////////////////////////////////////////
let table,
	devices = [],
	images = {};
let grid;
let sheetIndex = 0,
	baseSeed = 1337;

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
	createCanvas(CANVAS_W, CANVAS_H);

	if (!table || table.getRowCount() === 0) {
		console.error('CSV missing or empty');
		return;
	}

	// Build device records
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

		// Load image (re-render on load so they appear)
		if (rec.image_path && !images[rec.image_path]) {
			images[rec.image_path] = loadImage(
				rec.image_path,
				() => drawSheet(),
				(err) => console.error('Image load failed:', rec.image_path, err)
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

	background(255);

	const perSheet = COLS * ROWS;
	const start = sheetIndex * perSheet;
	const end = min(start + perSheet, devices.length);

	for (let i = start; i < end; i++) {
		const d = devices[i];
		const idx = i - start;
		const col = idx % COLS;
		const row = floor(idx / COLS);
		const cell = grid.getModule(col, row);

		const seed = hash(`${baseSeed}::${d.id}`);
		randomSeed(seed);
		noiseSeed(seed);

		drawStamp(d, cell.x, cell.y, cell.width, cell.height);
	}
}

//// ONE STAMP /////////////////////////////////////////////////////////////////
function drawStamp(d, x, y, w, h) {
	push();

	// Light background panel
	fill(STAMP_BG);
	noStroke();
	rect(
		x + STAMP_INSET,
		y + STAMP_INSET,
		w - STAMP_INSET * 2,
		h - STAMP_INSET * 2
	);

	// Content (order matters)
	drawCircuits(d, x, y, w, h);
	drawImage(d, x, y, w, h);

	// Border (varies per stamp)
	const borderStyle = pickBorderStyle(); // seeded by randomSeed()
	drawBorder(d, x, y, w, h, borderStyle);

	// Marks
	drawPriceStamp(d, x, y, w, h);
	drawRarityStars(d, x, y, w, h);
	drawCategoryBadge(d, x, y, w, h);
	drawText(d, x, y, w, h);

	pop();
}

//// BORDER VARIETY ////////////////////////////////////////////////////////////
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
		const step = 18,
			r = 6;
		push();
		noStroke();
		fill(255);
		for (let px = bx; px <= bx + bw; px += step) {
			circle(px, by, r * 2);
			circle(px, by + bh, r * 2);
		}
		for (let py = by; py <= by + bh; py += step) {
			circle(bx, py, r * 2);
			circle(bx + bw, py, r * 2);
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

//// CIRCUITS //////////////////////////////////////////////////////////////////
function drawCircuits(d, x, y, w, h) {
	const yr = isNaN(d.release_year)
		? 1990
		: constrain(d.release_year, 1960, 2020);
	const numLines = floor(map(yr, 1960, 2020, 25, 8));

	const { ix, iy, iw, ih } = getInnerFrame(x, y, w, h);
	const x0 = ix,
		y0 = iy,
		w0 = iw,
		h0 = ih;

	push();
	noFill();
	stroke(0, 50);
	strokeWeight(1.5);

	for (let i = 0; i < numLines; i++) {
		let px = random(x0, x0 + w0);
		let py = random(y0, y0 + h0);

		beginShape();
		vertex(px, py);
		for (let s = 0; s < 4; s++) {
			const step = random(20, 45);
			const dir = floor(random(4));
			if (dir === 0) px += step;
			else if (dir === 1) px -= step;
			else if (dir === 2) py += step;
			else py -= step;
			px = constrain(px, x0, x0 + w0);
			py = constrain(py, y0, y0 + h0);
			vertex(px, py);
		}
		endShape();
	}
	pop();
}

//// IMAGE /////////////////////////////////////////////////////////////////////
function drawImage(d, x, y, w, h) {
	const margin = 45;
	const imgX = x + STAMP_INSET + margin;
	const imgY = y + STAMP_INSET + margin;
	const imgW = w - (STAMP_INSET + margin) * 2;
	const imgH = h - (STAMP_INSET + margin) * 2 - 150;

	// white box
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

//// PRICE (top-right, inner frame) ////////////////////////////////////////////
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

//// STARS (aligned to inner-right) ////////////////////////////////////////////
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

//// CATEGORY BADGE (bottom-right, inner frame) ////////////////////////////////
function drawCategoryBadge(d, x, y, w, h) {
	const cat = (d.category || '').split('/')[0].trim().toLowerCase();
	const { ix, iy, iw, ih } = getInnerFrame(x, y, w, h);

	const bx = ix + iw - BADGE; // top-left of badge box
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

//// TEXT (robust, manual wrap) ////////////////////////////////////////////////
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
	textSize(18);
	const nameLines = wrapText(d.name, maxWidth);
	text(nameLines[0], cx, baseY);
	if (nameLines.length > 1) {
		textSize(16);
		text(nameLines[1], cx, baseY + 20);
	}

	// years
	textStyle(NORMAL);
	textSize(14);
	const yrs =
		!isNaN(d.release_year) && !isNaN(d.discontinued)
			? `${d.release_year}–${d.discontinued}`
			: !isNaN(d.release_year)
			? `${d.release_year}`
			: '';
	text(yrs, cx, baseY + 42);

	// region • manufacturer
	textSize(11);
	fill(70);
	const region = d.region || '',
		mfg = d.manufacturer || '';
	text(region && mfg ? `${region} • ${mfg}` : region || mfg, cx, baseY + 60);

	// form factor
	textSize(10);
	textStyle(ITALIC);
	fill(100);
	if (d.form_factor) text(d.form_factor, cx, baseY + 76);

	// reason (manual wrap; 1–3 lines, centered)
	textStyle(NORMAL);
	textSize(9);
	fill(130);
	if (d.reason_for_obsolescence) {
		const words = d.reason_for_obsolescence.trim().split(/\s+/);
		const boxW = maxWidth,
			maxLines = 3,
			lineGap = 11,
			startY = baseY + 92;

		// measure with LEFT align
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

		// draw centered
		textAlign(CENTER, TOP);
		for (let i = 0; i < lines.length; i++)
			text(lines[i], cx, startY + i * lineGap);
	}
	pop();
}

function wrapText(str, maxW) {
	textSize(18);
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
	if (key === 'r' || key === 'R') {
		baseSeed = floor(random(1e9));
		drawSheet();
	}
	if (key === 's' || key === 'S') {
		saveCanvas(`lost_circuits_sheet_${sheetIndex + 1}`, 'png');
	}
	if (keyCode === RIGHT_ARROW) {
		const perSheet = COLS * ROWS;
		const total = max(1, ceil(devices.length / perSheet));
		sheetIndex = (sheetIndex + 1) % total;
		drawSheet();
	}
	if (keyCode === LEFT_ARROW) {
		const perSheet = COLS * ROWS;
		const total = max(1, ceil(devices.length / perSheet));
		sheetIndex = (sheetIndex - 1 + total) % total;
		drawSheet();
	}
}
