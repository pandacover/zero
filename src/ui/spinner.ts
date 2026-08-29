/**
 * Zero-dependency terminal spinner/loader for Bun.
 */
export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private frameIndex = 0;
  private intervalId: any = null;
  private currentText = "";
  private isSpinning = false;

  start(text: string): this {
    this.currentText = text;
    if (this.isSpinning) {
      return this;
    }
    this.isSpinning = true;
    this.frameIndex = 0;

    // Render initial frame
    this.render();

    this.intervalId = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, 80);

    return this;
  }

  update(text: string): this {
    this.currentText = text;
    if (this.isSpinning) {
      this.render();
    }
    return this;
  }

  private render(): void {
    if (!process.stdout.isTTY) {
      return;
    }
    const frame = this.frames[this.frameIndex];
    // Cyan frame with text
    const line = `\r\x1b[36m${frame}\x1b[0m ${this.currentText}\x1b[K`;
    process.stdout.write(line);
  }

  stop(): this {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.isSpinning) {
      this.isSpinning = false;
      if (process.stdout.isTTY) {
        process.stdout.write("\r\x1b[K"); // clear current line
      }
    }
    return this;
  }

  succeed(text?: string): this {
    this.stop();
    const msg = text ?? this.currentText;
    console.log(`\x1b[32m✔\x1b[0m ${msg}`);
    return this;
  }

  fail(text?: string): this {
    this.stop();
    const msg = text ?? this.currentText;
    console.log(`\x1b[31m✖\x1b[0m ${msg}`);
    return this;
  }

  info(text?: string): this {
    this.stop();
    const msg = text ?? this.currentText;
    console.log(`\x1b[34mℹ\x1b[0m ${msg}`);
    return this;
  }
}
