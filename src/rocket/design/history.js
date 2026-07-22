/**
 * Undo / redo stack for design documents.
 */

import { cloneDesign } from './designModel.js';

export function createDesignHistory(limit = 50) {
  /** @type {object[]} */
  let undoStack = [];
  /** @type {object[]} */
  let redoStack = [];
  let current = null;

  function init(design) {
    current = cloneDesign(design);
    undoStack = [];
    redoStack = [];
    return cloneDesign(current);
  }

  function get() {
    return current ? cloneDesign(current) : null;
  }

  /**
   * Push a new design state (records previous for undo).
   */
  function push(design) {
    if (current) {
      undoStack.push(cloneDesign(current));
      if (undoStack.length > limit) undoStack.shift();
    }
    current = cloneDesign(design);
    redoStack = [];
    return cloneDesign(current);
  }

  /**
   * Replace current without creating history (e.g. live scrub that commits later).
   */
  function replace(design) {
    current = cloneDesign(design);
    return cloneDesign(current);
  }

  function undo() {
    if (!undoStack.length) return null;
    redoStack.push(cloneDesign(current));
    current = undoStack.pop();
    return cloneDesign(current);
  }

  function redo() {
    if (!redoStack.length) return null;
    undoStack.push(cloneDesign(current));
    current = redoStack.pop();
    return cloneDesign(current);
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function clear() {
    undoStack = [];
    redoStack = [];
    current = null;
  }

  return {
    init,
    get,
    push,
    replace,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
  };
}
