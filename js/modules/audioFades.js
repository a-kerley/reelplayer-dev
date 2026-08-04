// Wavesurfer volume fade in/out animations for smooth play/pause and track switches.
// Mixed into playerApp via Object.assign, so methods rely on `this` referring to playerApp.
//
// Fades are driven by native Web Audio AudioParam automation - a chain of
// GainNode.gain.linearRampToValueAtTime() calls approximating the eased
// curve, not a requestAnimationFrame loop calling wavesurfer.setVolume()
// every frame. That older approach set gainNode.gain.value directly on
// every step - each one is an instantaneous, unramped change to the signal,
// audible as a click/zipper-noise artifact (worse on bass-heavy content,
// since the waveform is rarely near zero when the jump lands). Automation
// methods hand the ramp to the browser's audio thread, which interpolates
// it sample-accurately - the standard, click-free way to do this.
//
// Note: this deliberately uses chained linearRampToValueAtTime() calls, NOT
// setValueCurveAtTime(), despite setValueCurveAtTime being the more direct
// fit for an arbitrary eased curve. Verified directly (50-run stress test)
// that setValueCurveAtTime has a real, intermittent Chromium bug: reused on
// the same GainNode across multiple play/pause cycles, gain.value would
// occasionally read back as the node's construction-time default (1) for a
// few milliseconds right as a new fade-in started - an audible full-volume
// blip before the ramp took over. The linearRampToValueAtTime chain
// produces the same audible curve and never reproduced that blip.
//
// Only one fade (in or out) is ever allowed to run at a time. Starting a new
// fade cancels whatever fade - in either direction - is currently in flight
// (both our own bookkeeping and any in-progress AudioParam automation), so
// two fades never fight over the same gain value.
//
// 20 points is already well beyond perceptible resolution for a ~0.3-0.4s
// fade (the audio thread linearly interpolates *between* scheduled points,
// so this isn't a step count the ear can hear - it's just how finely the
// eased curve's shape is approximated). Fewer scheduled AudioParam events
// per fade means less call overhead and a smaller window for the kind of
// scheduling hiccup handled below.
const CURVE_POINTS = 20;

// Scheduling an AudioParam event at exactly ctx.currentTime is racy: by the
// time the audio render thread gets to process it, that instant may already
// be in the past, and the event can be silently dropped (observed directly:
// setValueAtTime(1, t) with t === ctx.currentTime at call time sometimes
// just never took effect). A small forward buffer keeps every scheduled
// time unambiguously in the future.
const SCHEDULE_EPSILON = 0.01; // seconds

// --audio-fade-in/out-duration are static CSS custom properties (set once in
// variables.css; nothing in this codebase ever changes them at runtime), but
// applyAudioFadeInFromZero/applyAudioFadeOut run on every single play/pause -
// re-reading them via getComputedStyle() each time is a wasted style
// recalculation. Read once, lazily, and reuse.
let cachedFadeInDuration = null;
let cachedFadeOutDuration = null;

function getFadeInDuration() {
  if (cachedFadeInDuration === null) {
    cachedFadeInDuration = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--audio-fade-in-duration') || '0.4'
    );
  }
  return cachedFadeInDuration;
}

function getFadeOutDuration() {
  if (cachedFadeOutDuration === null) {
    cachedFadeOutDuration = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--audio-fade-out-duration') || '0.3'
    );
  }
  return cachedFadeOutDuration;
}

// Switching the OS default output device (or its sample rate) mid-session
// can leave the page's AudioContext auto-suspended by the browser while it
// reroutes to the new device. A suspended context doesn't throw when you
// schedule AudioParam automation on it - it just silently never renders the
// ramp, since ctx.currentTime stops advancing. The fade's own wall-clock
// setTimeout safety net still fires on schedule and force-corrects gain to
// the target value, so the net effect is an instant jump instead of a fade,
// with no error anywhere to explain why. Resuming first avoids that.
async function ensureAudioContextRunning(ctx) {
  console.debug('[audioFades] ensureAudioContextRunning: state before =', ctx.state);
  if (ctx.state === 'running') return;
  try {
    await ctx.resume();
    console.debug('[audioFades] ensureAudioContextRunning: state after resume =', ctx.state);
  } catch (error) {
    console.warn('[audioFades] AudioContext resume failed:', error);
  }
}

// Schedules `curve` (an array of gain values from 0..1 progress) as a chain
// of linear ramp segments starting at `startTime`, spanning `duration`.
function scheduleRampCurve(gain, curve, startTime, duration) {
  const segmentDuration = duration / (curve.length - 1);
  gain.setValueAtTime(curve[0], startTime);
  for (let i = 1; i < curve.length; i++) {
    gain.linearRampToValueAtTime(curve[i], startTime + segmentDuration * i);
  }
}

// Fade-in only: actively polls gain during the first ~30ms after scheduling
// and corrects it if it's caught far above where the curve should be at
// that point. This exists because, even with the SCHEDULE_EPSILON delay,
// gain has been observed (rarely, and browser-dependent) to briefly read
// back near its construction-time default right as a fade-in starts on a
// freshly-started AudioBufferSourceNode - a genuine Web Audio timing issue,
// not something under this code's control. This can't fully prevent a spike
// (the very first render quantum after it happens is already audible by the
// time we detect it), but it cuts the duration from several milliseconds
// down to one poll interval, and it's a pure no-op whenever nothing goes
// wrong (the common case).
const SPIKE_WATCH_WINDOW_MS = 30;
const SPIKE_WATCH_POLL_MS = 2;

function watchForEarlyFadeInSpike(gain, ctx, fadeDuration, targetVolume) {
  const watchStart = performance.now();
  const poll = () => {
    const elapsedMs = performance.now() - watchStart;
    if (elapsedMs > SPIKE_WATCH_WINDOW_MS) return;
    const expectedProgress = Math.max(0, Math.min(1, elapsedMs / (fadeDuration * 1000)));
    const expectedGain = targetVolume * expectedProgress * expectedProgress;
    if (gain.value > expectedGain + 0.15) {
      console.debug('[audioFades] watchForEarlyFadeInSpike: spike detected, gain.value =', gain.value, 'expectedGain =', expectedGain, 'elapsedMs =', elapsedMs);
      try {
        const now = ctx.currentTime;
        gain.cancelScheduledValues(now);
        const remaining = Math.max(fadeDuration - elapsedMs / 1000, 0.02);
        const steps = 15;
        gain.setValueAtTime(expectedGain, now + 0.002);
        for (let i = 1; i <= steps; i++) {
          const p = expectedProgress + (1 - expectedProgress) * (i / steps);
          gain.linearRampToValueAtTime(targetVolume * p * p, now + 0.002 + (remaining / steps) * i);
        }
      } catch (error) {
        console.warn('[audioFades] Spike correction failed:', error);
      }
      return; // one correction is enough - the end-of-fade check still guarantees final correctness
    }
    setTimeout(poll, SPIKE_WATCH_POLL_MS);
  };
  setTimeout(poll, SPIKE_WATCH_POLL_MS);
}

export const audioFades = {
  cancelActiveFades() {
    if (this.activeFadeIn) {
      clearTimeout(this.activeFadeIn.timeoutId);
      this.activeFadeIn = null;
    }
    if (this.activeFadeOut) {
      if (this.activeFadeOut.cancel) this.activeFadeOut.cancel();
      clearTimeout(this.activeFadeOut.timeoutId);
      this.activeFadeOut = null;
    }
    // The above only clears our own JS-side bookkeeping (timeouts, pending
    // promises) - it doesn't touch the actual Web Audio automation still
    // scheduled on the GainNode. Cancel that too: otherwise a caller that
    // calls cancelActiveFades() and then does a raw wavesurfer.setVolume()
    // (a direct gainNode.gain.value= write) can throw by landing inside the
    // still-active curve's time range, since our own fade methods are the
    // only thing that normally clears it (via their own cancelScheduledValues
    // call at start) - a caller going around them needs it done here instead.
    const g = this._getGainParam();
    if (g) {
      try {
        g.gain.cancelScheduledValues(g.ctx.currentTime);
      } catch (error) {
        console.warn('[audioFades] cancelScheduledValues failed:', error);
      }
    }
  },

  // wavesurfer's WebAudio backend (getMediaElement()) exposes a real
  // GainNode/AudioContext as plain properties - not officially documented,
  // but getMediaElement() itself is public API, and this is a well-known
  // technique for wavesurfer.js v7. Falls back to null if a future
  // wavesurfer version restructures this, so callers can degrade gracefully
  // instead of throwing.
  _getGainParam() {
    const media = this.wavesurfer?.getMediaElement?.();
    console.debug('[audioFades] _getGainParam:', {
      hasMedia: !!media,
      hasGainNode: !!media?.gainNode,
      hasGainParam: !!media?.gainNode?.gain,
      hasAudioContext: !!media?.audioContext,
      audioContextState: media?.audioContext?.state,
    });
    if (!media?.gainNode?.gain || !media?.audioContext) return null;
    return { gain: media.gainNode.gain, ctx: media.audioContext };
  },

  async applyAudioFadeInFromZero(targetVolume) {
    console.debug('[audioFades] applyAudioFadeInFromZero called, targetVolume =', targetVolume);
    if (!this.wavesurfer) {
      console.debug('[audioFades] applyAudioFadeInFromZero: no wavesurfer, bailing');
      return;
    }
    this.cancelActiveFades();

    const fadeDuration = getFadeInDuration();
    console.debug('[audioFades] applyAudioFadeInFromZero: fadeDuration =', fadeDuration);

    const g = this._getGainParam();
    if (!g) {
      console.warn('[audioFades] GainNode unavailable, falling back to direct setVolume (may click).');
      this.wavesurfer.setVolume(targetVolume);
      return;
    }
    const { gain, ctx } = g;
    console.debug('[audioFades] applyAudioFadeInFromZero: gain.value before scheduling =', gain.value, 'ctx.currentTime =', ctx.currentTime);

    await ensureAudioContextRunning(ctx);

    // Ease-in curve, sampled - same shape as the old per-frame `progress²`.
    const curve = new Float32Array(CURVE_POINTS);
    for (let i = 0; i < CURVE_POINTS; i++) {
      const progress = i / (CURVE_POINTS - 1);
      curve[i] = targetVolume * (progress * progress);
    }

    // Web Audio scheduling here has proven to throw in real, if rare,
    // circumstances (a still-active prior automation range colliding with a
    // new one). If it throws mid-call, gain is left wherever
    // wavesurfer.setVolume(0) put it just before this ran - permanently
    // silent, with playback otherwise running normally (looks like "the
    // player broke," but it's actually just muted). Never let that happen:
    // on any failure here, fall back to an immediate, guaranteed-correct
    // direct volume set - an audible jump instead of a smooth ramp, but
    // never silence with no way out short of a reload.
    try {
      const now = ctx.currentTime;
      const startTime = now + SCHEDULE_EPSILON;
      gain.cancelScheduledValues(now);
      scheduleRampCurve(gain, curve, startTime, fadeDuration);
      console.debug('[audioFades] applyAudioFadeInFromZero: ramp scheduled, startTime =', startTime, 'duration =', fadeDuration, 'curve[0..2] =', Array.from(curve.slice(0, 3)));
    } catch (error) {
      console.warn('[audioFades] Fade-in scheduling failed, jumping to target volume instead:', error);
      // Cancel first: scheduleRampCurve may have partially succeeded before
      // throwing (e.g. the initial setValueAtTime(0, ...) landed before a
      // later linearRampToValueAtTime call failed) - that leftover scheduled
      // event would otherwise fire later and silently overwrite this direct
      // fallback write once its time arrives.
      try { gain.cancelScheduledValues(ctx.currentTime); } catch { /* ignore */ }
      this.wavesurfer.setVolume(targetVolume);
      return;
    }

    watchForEarlyFadeInSpike(gain, ctx, fadeDuration, targetVolume);

    const fadeState = { timeoutId: null };
    this.activeFadeIn = fadeState;
    fadeState.timeoutId = setTimeout(() => {
      if (this.activeFadeIn === fadeState) this.activeFadeIn = null;
      // Defensive correction: guarantee we actually landed on target,
      // regardless of any Web Audio scheduling flakiness during the ramp
      // (observed directly: gain can occasionally end up somewhere other
      // than where it was scheduled to go). A silent no-op if everything
      // went as scheduled; a direct correction (possibly audible, but
      // correct) if it didn't.
      if (Math.abs(gain.value - targetVolume) > 0.02) {
        console.warn(`[audioFades] Fade-in ended off-target (gain=${gain.value.toFixed(4)}, target=${targetVolume}) - correcting`);
        gain.cancelScheduledValues(ctx.currentTime);
        gain.value = targetVolume;
      } else {
        console.debug('[audioFades] applyAudioFadeInFromZero: ended on-target, gain.value =', gain.value);
      }
    }, (fadeDuration + SCHEDULE_EPSILON) * 1000);
  },

  /**
   * Apply audio fade-out effect when playback stops
   * Smoothly ramps down volume from current level to 0
   * @param {boolean} pauseAfterFade - Whether to pause playback after fade completes
   * @returns {Promise} Resolves when fade-out completes
   */
  async applyAudioFadeOut(pauseAfterFade = false) {
    console.debug('[audioFades] applyAudioFadeOut called, pauseAfterFade =', pauseAfterFade);
    if (!this.wavesurfer) {
      console.debug('[audioFades] applyAudioFadeOut: no wavesurfer, bailing');
      return;
    }
    this.cancelActiveFades();

    const fadeDuration = getFadeOutDuration();

    const startVolume = this.wavesurfer.getVolume();
    console.debug('[audioFades] applyAudioFadeOut: fadeDuration =', fadeDuration, 'startVolume =', startVolume);

    const g = this._getGainParam();
    if (!g) {
      console.warn('[audioFades] GainNode unavailable, falling back to direct setVolume (may click).');
      this.wavesurfer.setVolume(0);
      if (pauseAfterFade) {
        this.wavesurfer.pause();
        this.wavesurfer.setVolume(startVolume);
      }
      return;
    }
    const { gain, ctx } = g;
    console.debug('[audioFades] applyAudioFadeOut: gain.value before scheduling =', gain.value, 'ctx.currentTime =', ctx.currentTime);

    await ensureAudioContextRunning(ctx);

    // Ease-out curve, sampled - same shape as the old per-frame `(1-progress)²`.
    const curve = new Float32Array(CURVE_POINTS);
    for (let i = 0; i < CURVE_POINTS; i++) {
      const progress = i / (CURVE_POINTS - 1);
      curve[i] = startVolume * (1 - progress) * (1 - progress);
    }

    // If scheduling throws here, fall straight to the guaranteed-correct
    // fallback (direct volume set + pause if requested) rather than leaving
    // the promise never resolving and pause() never called - a caller doing
    // `await applyAudioFadeOut(true)` (track-switch) would otherwise hang
    // forever, and the play/pause button (pauseAfterFade case) would look
    // completely unresponsive.
    try {
      const now = ctx.currentTime;
      const startTime = now + SCHEDULE_EPSILON;
      gain.cancelScheduledValues(now);
      scheduleRampCurve(gain, curve, startTime, fadeDuration);
      console.debug('[audioFades] applyAudioFadeOut: ramp scheduled, startTime =', startTime, 'duration =', fadeDuration);
    } catch (error) {
      console.warn('[audioFades] Fade-out scheduling failed, jumping to silence instead:', error);
      try { gain.cancelScheduledValues(ctx.currentTime); gain.value = 0; } catch { /* ignore */ }
      if (pauseAfterFade) {
        this.wavesurfer.pause();
        try { gain.value = startVolume; } catch { /* ignore */ }
      }
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const fadeState = {
        timeoutId: null,
        // Called by cancelActiveFades() if a new fade interrupts this one -
        // the interrupting fade already cancelled the AudioParam automation
        // itself, this just needs to settle our own pending promise.
        cancel: () => resolve()
      };
      this.activeFadeOut = fadeState;

      fadeState.timeoutId = setTimeout(() => {
        console.debug('[audioFades] applyAudioFadeOut: fade timeout fired, gain.value =', gain.value, 'pauseAfterFade =', pauseAfterFade);
        // Only restore gain to startVolume once we know playback has
        // actually stopped (pause() synchronously stops the underlying
        // buffer source). Restoring it while still playing - even for a
        // moment - is audible as a pop, since it undoes the fade before
        // anything has silenced the output. If not pausing, leave gain
        // wherever the fade left it (true silence); restoring it here for a
        // still-playing track would just undo the fade the caller asked for.
        if (pauseAfterFade) {
          this.wavesurfer.pause();
          // Once the underlying buffer source is stopped, the browser stops
          // processing this GainNode's *scheduled* automation entirely (verified
          // directly: a setValueAtTime scheduled just after pause() silently
          // never took effect - nothing is "pulling" audio through the node to
          // drive the render graph anymore). A direct property write bypasses
          // that: it's an immediate, synchronous set, not dependent on a future
          // render tick ever arriving. Safe here regardless - audio is already
          // stopped, so there's no click risk from an unramped change.
          try {
            gain.cancelScheduledValues(ctx.currentTime); // clear any leftover automation so it can't resurface on next play()
            gain.value = startVolume;
          } catch (error) {
            console.warn('[audioFades] Post-pause volume restore failed:', error);
          }
        }
        this.activeFadeOut = null;
        resolve();
      }, (fadeDuration + SCHEDULE_EPSILON) * 1000);
    });
  },
};
