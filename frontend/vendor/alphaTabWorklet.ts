// SPDX-License-Identifier: MPL-2.0
// alphaTab 1.9.0 creates a new node on each play. Keep one node per player
// and clear the processor's queue on each pause. The published patch source
// and original alphaTab tag are listed in the /at/ notices.
export function patchAlphaTabRuntime(source: string): string {
  const processor = source.indexOf('class AlphaSynthWebWorklet {');
  const output = source.indexOf('class AlphaSynthAudioWorkletOutput extends', processor);
  const next = source.indexOf('// src/platform/javascript/Html5Canvas.ts', output);
  if (processor < 0 || output < 0 || next < 0) throw new Error('Unexpected alphaTab 1.9.0 Worklet source');

  const replace = (section: string, pattern: string, replacement: string) => {
    if (!section.includes(pattern) || section.indexOf(pattern) !== section.lastIndexOf(pattern)) {
      throw new Error('Unexpected alphaTab 1.9.0 Worklet implementation');
    }
    return section.replace(pattern, replacement);
  };
  let scope = source.slice(processor, output);
  scope = replace(scope, '_isStopped = false;', "_isStopped = false;\n\t\t\t_isPaused = true;");
  scope = replace(scope, 'case "alphaSynth.output.addSamples":', `case "alphaSynth.output.addSamples":
                        if (this._isPaused) break;`);
  scope = replace(scope, 'case "alphaSynth.output.stop": this._isStopped = true;', `case "alphaSynth.output.pause":
                        this._isPaused = true;
                        this._playedFrames.flush();
                        this._circularBuffer.clear();
                        this._requestedBufferCount = 0;
                        break;
                    case "alphaSynth.output.resume":
                        this._isPaused = false;
                        break;
                    case "alphaSynth.output.stop":
                        this._isStopped = true;
                        this._circularBuffer.clear();`);
  scope = replace(scope, 'process(_inputs, outputs, _parameters) {', `process(_inputs, outputs, _parameters) {
                if (this._isStopped) return false;
                if (this._isPaused) return true;`);

  let graph = source.slice(output, next);
  const start = graph.indexOf('		if (!await this._loadWorklet(ctx)) return;');
  const published = graph.indexOf('		this._worklet = worklet;', start);
  if (start < 0 || published < 0) throw new Error('Unexpected alphaTab Worklet start');
  const allocate = graph.slice(start, published)
    .replace('const worklet = new AudioWorkletNode', 'worklet = new AudioWorkletNode')
    .split("\n").filter(Boolean).map((line) => '	' + line).join("\n");
  graph = graph.slice(0, start) + `        if (this._destroyed.signal.aborted) return;
        let worklet = this._worklet;
        if (!worklet) {
${allocate}
            this._worklet = worklet;
        }
        worklet.port.postMessage({ cmd: "alphaSynth.output.resume" });
` + graph.slice(published + "\t\tthis._worklet = worklet;\n".length);
  graph = replace(graph, `			worklet.port.postMessage({ cmd: "alphaSynth.output.stop" });
			worklet.port.removeEventListener("message", this._boundHandleMessage);
			worklet.disconnect();
		}
		this._worklet = null;`, `            const closing = this._destroyed.signal.aborted;
            worklet.port.postMessage({ cmd: closing ? "alphaSynth.output.stop" : "alphaSynth.output.pause" });
            worklet.port.removeEventListener("message", this._boundHandleMessage);
            worklet.disconnect();
            if (closing) {
                worklet.port.close();
                this._worklet = null;
            }
        }`);
  // Detached canvases sit outside the scroll viewport. Budget them against
  // the visible score area so scrolling a longer score cannot keep multiple
  // full-window bitmaps in addition to the visible score.
  const runtime = source.slice(0, processor) + scope + graph + source.slice(next);
  return replace(runtime,
    'this._detachedPartials.budget = BrowserUiFacade._detachedViewportBudget * rootBounds.width * rootBounds.height;',
    'this._detachedPartials.budget = (this.rootContainer.element.parentElement?.clientWidth ?? rootBounds.width) * (this.rootContainer.element.parentElement?.clientHeight ?? rootBounds.height);',
  );
}
