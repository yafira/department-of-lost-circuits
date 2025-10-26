/* EasyGrid.js - Simple Grid System for p5.js
 * Creates a modular grid with gutters
 */

class EasyGrid {
	constructor(options) {
		// Required parameters
		this.x = options.x || 0;
		this.y = options.y || 0;
		this.width = options.width;
		this.height = options.height;
		this.cols = options.cols;
		this.rows = options.rows;

		// Optional parameters
		this.gutterX = options.gutterX || 0;
		this.gutterY = options.gutterY || 0;

		// Calculate module dimensions
		const totalGutterWidth = this.gutterX * (this.cols - 1);
		const totalGutterHeight = this.gutterY * (this.rows - 1);

		this.moduleWidth = (this.width - totalGutterWidth) / this.cols;
		this.moduleHeight = (this.height - totalGutterHeight) / this.rows;

		// Pre-calculate all modules
		this.modules = [];
		for (let row = 0; row < this.rows; row++) {
			for (let col = 0; col < this.cols; col++) {
				const moduleX = this.x + col * (this.moduleWidth + this.gutterX);
				const moduleY = this.y + row * (this.moduleHeight + this.gutterY);

				this.modules.push({
					x: moduleX,
					y: moduleY,
					width: this.moduleWidth,
					height: this.moduleHeight,
					col: col,
					row: row,
					index: row * this.cols + col,
				});
			}
		}
	}

	// Get a specific module by column and row
	getModule(col, row) {
		if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
			console.error(`Module (${col}, ${row}) is out of bounds`);
			return null;
		}
		return this.modules[row * this.cols + col];
	}

	// Get a module by its linear index
	getModuleByIndex(index) {
		if (index < 0 || index >= this.modules.length) {
			console.error(`Module index ${index} is out of bounds`);
			return null;
		}
		return this.modules[index];
	}

	// Get all modules
	getAllModules() {
		return this.modules;
	}

	// Draw the grid (for debugging)
	display(options = {}) {
		const showModules = options.showModules !== false;
		const showGutters = options.showGutters !== false;
		const moduleColor = options.moduleColor || [200, 200, 255, 100];
		const gutterColor = options.gutterColor || [255, 200, 200, 100];
		const strokeColor = options.strokeColor || [100, 100, 150];

		push();

		// Draw gutters
		if (showGutters && (this.gutterX > 0 || this.gutterY > 0)) {
			noStroke();
			fill(...gutterColor);

			// Vertical gutters
			for (let col = 0; col < this.cols - 1; col++) {
				const gutterX =
					this.x + (col + 1) * this.moduleWidth + col * this.gutterX;
				rect(gutterX, this.y, this.gutterX, this.height);
			}

			// Horizontal gutters
			for (let row = 0; row < this.rows - 1; row++) {
				const gutterY =
					this.y + (row + 1) * this.moduleHeight + row * this.gutterY;
				rect(this.x, gutterY, this.width, this.gutterY);
			}
		}

		// Draw modules
		if (showModules) {
			for (let module of this.modules) {
				stroke(...strokeColor);
				strokeWeight(1);
				fill(...moduleColor);
				rect(module.x, module.y, module.width, module.height);

				// Optional: draw module coordinates
				if (options.showLabels) {
					noStroke();
					fill(0);
					textAlign(CENTER, CENTER);
					textSize(10);
					text(
						`${module.col},${module.row}`,
						module.x + module.width / 2,
						module.y + module.height / 2
					);
				}
			}
		}

		// Draw outer boundary
		if (options.showBoundary !== false) {
			noFill();
			stroke(...strokeColor);
			strokeWeight(2);
			rect(this.x, this.y, this.width, this.height);
		}

		pop();
	}

	// Get total number of modules
	getModuleCount() {
		return this.modules.length;
	}

	// Get grid info
	getInfo() {
		return {
			x: this.x,
			y: this.y,
			width: this.width,
			height: this.height,
			cols: this.cols,
			rows: this.rows,
			gutterX: this.gutterX,
			gutterY: this.gutterY,
			moduleWidth: this.moduleWidth,
			moduleHeight: this.moduleHeight,
			moduleCount: this.modules.length,
		};
	}
}

// Make it available globally for p5.js
if (typeof window !== 'undefined') {
	window.EasyGrid = EasyGrid;
}
