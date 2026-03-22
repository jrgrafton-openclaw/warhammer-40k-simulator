/* ══════════════════════════════════════════════════════════════
   Editor Mirror — point-reflect all terrain sprites around map center.

   Point reflection = 180° rotation around (360, 264).
   For each sprite:
     1. Position: newX = 720 - x - w, newY = 528 - y - h
     2. Rotation: rot + 180°  (the rotation handles the visual reflection)
     3. Flips: SAME as original  (NOT inverted — rotation handles it)
     4. Crops: SAME as original  (NOT swapped — clip rotates with sprite)
     5. All other properties copied verbatim

   Why flips stay the same:
     R(rot+180°) * S(flip) = R(180°) * R(rot) * S(flip)
     The R(180°) IS the point reflection. No flip change needed.
     Since flips don't change, _applyClip's internal flip-swap is
     identical to the original → crop clips correctly.

   Uses Batch command for single-step undo (Cmd+Z).
══════════════════════════════════════════════════════════════ */

Editor.Mirror = {
  mirrorXY: function() {
    var C = Editor.Core;
    var originals = C.allSprites.slice(); // snapshot before mutations
    if (!originals.length) return;

    var MAP_W = 720, MAP_H = 528;
    var commands = [];
    var newSprites = [];

    // ── Step 1: Create all duplicates with mirrored transforms ──
    originals.forEach(function(original) {
      // Position: reflect bounding box around center
      var newX = MAP_W - original.x - original.w;
      var newY = MAP_H - original.y - original.h;

      // Rotation: add 180° (handles the visual point reflection)
      var newRot = (original.rot || 0) + 180;
      // Normalize to -180..360 range (keep consistent with editor conventions)
      if (newRot > 360) newRot -= 360;

      // Create the sprite (skipSelect=true)
      var dup = Editor.Sprites.addSprite(
        original.file, newX, newY, original.w, original.h, newRot,
        original.layerType, true /* skipSelect */
      );

      // Flips: keep SAME as original (NOT inverted)
      dup.flipX = original.flipX;
      dup.flipY = original.flipY;

      // Crops: keep SAME as original (NOT swapped)
      dup.cropL = original.cropL || 0;
      dup.cropT = original.cropT || 0;
      dup.cropR = original.cropR || 0;
      dup.cropB = original.cropB || 0;

      // Copy other properties
      dup.hidden = original.hidden;
      dup.el.style.display = dup.hidden ? 'none' : '';
      dup.shadowMul = original.shadowMul != null ? original.shadowMul : 1.0;

      // Apply visual transforms (rotation + flip) to SVG element
      Editor.Sprites.apply(dup);

      // Apply crop clip if sprite has any crop values
      if (dup.cropL || dup.cropT || dup.cropR || dup.cropB) {
        Editor.Crop._applyClip(dup);
      }

      // Apply sprite effects (shadows, color grade, etc.)
      if (Editor.Effects && Editor.Effects._ready) {
        Editor.Effects._applyToSprite(dup);
      }

      newSprites.push({ dup: dup, original: original });
    });

    // ── Step 2: Place duplicates in correct DOM positions ──
    // (Done as separate pass so all sprites exist before repositioning)
    newSprites.forEach(function(pair) {
      var dup = pair.dup;
      var original = pair.original;
      var dupEl = dup.rootEl;
      var origEl = original.rootEl;

      if (original.groupId) {
        // Grouped: insert duplicate into same group, directly after original
        dup.groupId = original.groupId;
        if (dupEl.parentNode) dupEl.parentNode.removeChild(dupEl);
        origEl.parentNode.insertBefore(dupEl, origEl.nextSibling);
      } else {
        // Ungrouped: insert directly after original in SVG
        if (dupEl.parentNode) dupEl.parentNode.removeChild(dupEl);
        origEl.parentNode.insertBefore(dupEl, origEl.nextSibling);
      }
    });

    // ── Step 3: Build undo command (single batch) ──
    newSprites.forEach(function(pair) {
      commands.push(Editor.Commands.AddSprite.create(
        Editor.Commands._captureSprite(pair.dup)
      ));
    });
    Editor.Undo.record(Editor.Commands.Batch.create(commands, 'Mirror XY'));

    // ── Step 4: Sync state and rebuild ──
    Editor.State.syncZOrderFromDOM();
    Editor.State.dispatch({ type: 'MIRROR_XY' });

    // Ensure UI overlays stay on top
    var svg = document.getElementById('battlefield');
    var selUI = document.getElementById('selUI');
    var dragRect = document.getElementById('dragRect');
    if (selUI) svg.appendChild(selUI);
    if (dragRect) svg.appendChild(dragRect);
  }
};
