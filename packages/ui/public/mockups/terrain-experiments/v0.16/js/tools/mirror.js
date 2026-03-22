/* ══════════════════════════════════════════════════════════════
   Editor Mirror — point-reflect all terrain sprites around map center
   Uses command-pattern undo: creates a Batch of AddSprite commands
   so the entire mirror is one undo step.
══════════════════════════════════════════════════════════════ */

Editor.Mirror = {
  mirrorXY() {
    var C = Editor.Core;
    var sprites = C.allSprites.slice(); // snapshot before mutations
    if (!sprites.length) return;

    var MAP_W = 720, MAP_H = 528;
    var commands = [];

    sprites.forEach(function(original) {
      // Compute mirrored position (point reflection around center)
      var newX = MAP_W - original.x - original.w;
      var newY = MAP_H - original.y - original.h;
      var newRot = ((original.rot || 0) + 180) % 360;

      // Create duplicate via addSprite (skipSelect=true)
      var dup = Editor.Sprites.addSprite(
        original.file, newX, newY, original.w, original.h, newRot,
        original.layerType, true /* skipSelect */
      );

      // Copy properties — flip is inverted for point reflection
      dup.flipX = !original.flipX;
      dup.flipY = !original.flipY;
      dup.hidden = original.hidden;
      dup.el.style.display = dup.hidden ? 'none' : '';
      dup.shadowMul = original.shadowMul != null ? original.shadowMul : 1.0;

      // Swap crops (L↔R, T↔B)
      dup.cropL = original.cropR || 0;
      dup.cropR = original.cropL || 0;
      dup.cropT = original.cropB || 0;
      dup.cropB = original.cropT || 0;

      // Apply flip/rotation to SVG element
      Editor.Sprites.apply(dup);

      // Apply crop clips if any
      if (dup.cropL || dup.cropT || dup.cropR || dup.cropB) {
        Editor.Crop._applyClip(dup);
      }

      // Handle group membership
      if (original.groupId) {
        dup.groupId = original.groupId;
        var origEl = original.rootEl;
        var dupEl = dup.rootEl;
        // Remove from current parent and insert after original in the group
        if (dupEl.parentNode) dupEl.parentNode.removeChild(dupEl);
        origEl.parentNode.insertBefore(dupEl, origEl.nextSibling);
      } else {
        // Ungrouped: insert directly after original in SVG
        var origEl2 = original.rootEl;
        var dupEl2 = dup.rootEl;
        if (dupEl2.parentNode) dupEl2.parentNode.removeChild(dupEl2);
        origEl2.parentNode.insertBefore(dupEl2, origEl2.nextSibling);
      }

      // Apply effects
      if (Editor.Effects && Editor.Effects._ready) Editor.Effects._applyToSprite(dup);

      // Build undo command for this sprite
      commands.push(Editor.Commands.AddSprite.create(Editor.Commands._captureSprite(dup)));
    });

    // Record as a single batch undo operation
    Editor.Undo.record(Editor.Commands.Batch.create(commands, 'Mirror XY'));

    // Sync state and rebuild
    Editor.State.syncZOrderFromDOM();
    Editor.State.dispatch({ type: 'MIRROR_XY' });

    // Ensure selUI and dragRect stay last in SVG
    var svg = document.getElementById('battlefield');
    var selUI = document.getElementById('selUI');
    var dragRect = document.getElementById('dragRect');
    if (selUI) svg.appendChild(selUI);
    if (dragRect) svg.appendChild(dragRect);
  }
};
