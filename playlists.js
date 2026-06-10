/**
 * Hierarchical playlists: folders (parent) and playlists (leaf, song lists).
 * Persisted as playlists.json
 */

const TYPE_FOLDER = 'folder';
const TYPE_PLAYLIST = 'playlist';

function playlistId() {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function folderId() {
  return `fd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSongTitles(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    const t = String(s || '').trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === TYPE_FOLDER ? TYPE_FOLDER : TYPE_PLAYLIST;
  const id = String(raw.id || '').trim() || (type === TYPE_FOLDER ? folderId() : playlistId());
  const name = String(raw.name || '').trim() || (type === TYPE_FOLDER ? 'Folder' : 'Playlist');
  const parentId = raw.parentId == null || raw.parentId === '' ? null : String(raw.parentId).trim();
  if (type === TYPE_FOLDER) {
    return { id, type: TYPE_FOLDER, name, parentId };
  }
  return {
    id,
    type: TYPE_PLAYLIST,
    name,
    parentId,
    songs: normalizeSongTitles(raw.songs),
  };
}

function isFolder(item) {
  return item?.type === TYPE_FOLDER;
}

function isPlaylist(item) {
  return item?.type === TYPE_PLAYLIST;
}

function getPlaylistItems(items) {
  return (items || []).filter(isPlaylist);
}

function findItem(items, id) {
  if (!id) return null;
  return (items || []).find((it) => it.id === id) || null;
}

function getChildren(items, parentId) {
  const pid = parentId == null ? null : parentId;
  return (items || []).filter((it) => (it.parentId || null) === pid);
}

function collectDescendantIds(items, rootId) {
  const out = [rootId];
  const kids = getChildren(items, rootId);
  for (const k of kids) {
    out.push(...collectDescendantIds(items, k.id));
  }
  return out;
}

function firstPlaylistId(items) {
  const pl = getPlaylistItems(items)[0];
  return pl ? pl.id : null;
}

function normalizePlaylists(raw) {
  const items = [];
  const expandedFolderIds = [];

  if (raw && typeof raw === 'object' && Array.isArray(raw.items)) {
    for (const p of raw.items) {
      const it = normalizeItem(p);
      if (it) items.push(it);
    }
    if (Array.isArray(raw.expandedFolderIds)) {
      for (const id of raw.expandedFolderIds) {
        const fid = String(id || '').trim();
        if (fid && items.some((it) => it.id === fid && isFolder(it))) {
          expandedFolderIds.push(fid);
        }
      }
    }
  }

  if (!items.length && raw && Array.isArray(raw.setlist)) {
    items.push({
      id: playlistId(),
      type: TYPE_PLAYLIST,
      name: 'Playlist 1',
      parentId: null,
      songs: normalizeSongTitles(raw.setlist),
    });
  }

  if (!getPlaylistItems(items).length) {
    items.push({
      id: playlistId(),
      type: TYPE_PLAYLIST,
      name: 'Playlist 1',
      parentId: null,
      songs: [],
    });
  }

  const idSet = new Set(items.map((it) => it.id));
  for (const it of items) {
    if (it.parentId && !idSet.has(it.parentId)) it.parentId = null;
    if (it.parentId === it.id) it.parentId = null;
  }

  let activePlaylistId = String(raw?.activePlaylistId || raw?.activeId || '').trim();
  const activeItem = findItem(items, activePlaylistId);
  if (!activeItem || !isPlaylist(activeItem)) {
    activePlaylistId = firstPlaylistId(items);
  }

  let treeFocusId = String(raw?.treeFocusId || '').trim();
  if (!findItem(items, treeFocusId)) treeFocusId = activePlaylistId;

  return {
    activePlaylistId,
    treeFocusId,
    expandedFolderIds: [...new Set(expandedFolderIds)],
    items,
  };
}

module.exports = {
  TYPE_FOLDER,
  TYPE_PLAYLIST,
  playlistId,
  folderId,
  normalizeSongTitles,
  normalizeItem,
  normalizePlaylists,
  isFolder,
  isPlaylist,
  getPlaylistItems,
  findItem,
  getChildren,
  collectDescendantIds,
  firstPlaylistId,
};
