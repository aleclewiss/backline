// live-bridge.js - runs in the [js] object inside ACE_Sidebar.amxd.
// Watches Live project context (tempo, time signature, scale) and pushes it
// to the node.script sidecar; handles insert requests coming back from it.
//
// outlet 0 -> node.script inlet (context messages)
// outlet 1 -> [route stage] -> live.drag (fallback drag staging)

autowatch = 1;
outlets = 2;

var observers = [];
var ready = false;

function bang() {
  // [live.thisdevice] bangs once the Live API is available.
  ready = true;
  setup_observers();
  push_all();
}

function sidecar_ready() {
  // node.script finished booting; (re)send current state.
  if (ready) push_all();
}

function resync() {
  if (ready) push_all();
}

function setup_observers() {
  clear_observers();
  observe('live_set', 'tempo', function (v) { outlet(0, 'tempo', v); });
  observe('live_set', 'signature_numerator', function () { push_signature(); });
  observe('live_set', 'signature_denominator', function () { push_signature(); });
  // Live 12+: scale awareness on the Song.
  observe('live_set', 'root_note', function () { push_scale(); });
  observe('live_set', 'scale_name', function () { push_scale(); });
}

function observe(path, prop, fn) {
  var api = new LiveAPI(function (args) {
    // args: [property, value, ...]; ignore the initial 'id' callback
    if (args[0] === prop) fn(args[1]);
  }, path);
  api.property = prop;
  observers.push(api);
}

function clear_observers() {
  for (var i = 0; i < observers.length; i++) observers[i].property = '';
  observers = [];
}

function push_all() {
  var song = new LiveAPI('live_set');
  outlet(0, 'tempo', song.get('tempo'));
  push_signature();
  push_scale();
  push_project_name();
}

function push_signature() {
  var song = new LiveAPI('live_set');
  outlet(0, 'signature', song.get('signature_numerator'), song.get('signature_denominator'));
}

var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function push_scale() {
  try {
    var song = new LiveAPI('live_set');
    var root = song.get('root_note');
    var scale = song.get('scale_name');
    root = (root instanceof Array) ? root[0] : root;
    scale = (scale instanceof Array) ? scale.join(' ') : scale;
    if (root !== null && root >= 0 && root <= 11) {
      outlet(0, 'scale', NOTE_NAMES[root], String(scale || 'Major'));
    }
  } catch (e) {
    // Pre-Live-12: no scale on Song; sidebar falls back to manual key.
  }
}

function push_project_name() {
  try {
    var song = new LiveAPI('live_set');
    var fp = song.get('file_path'); // Live 12.2+; throws/empty earlier
    fp = (fp instanceof Array) ? fp.join(' ') : fp;
    if (fp && typeof fp === 'string') {
      var base = fp.split(/[\\\/]/).pop().replace(/\.als$/i, '');
      if (base) outlet(0, 'project', base);
    }
  } catch (e) { /* keep 'default' */ }
}

// insert_clip <path> <name> <type> - from the sidecar when the user clicks
// "Insert to selected track". Tries the highlighted clip slot; if the Live
// version can't create audio clips via the API, stages the file on
// [live.drag] instead so the user can drag it in.
function insert_clip(path, name, type) {
  if (!ready) { stage(path); return; }
  try {
    var slot = new LiveAPI('live_set view highlighted_clip_slot');
    if (!slot.id || slot.id === 0) { stage(path); return; }
    if (Number(slot.get('has_clip'))) {
      // Occupied: don't overwrite someone's clip - stage for manual drop.
      stage(path);
      return;
    }
    slot.call('create_audio_clip', path);
    if (Number(slot.get('has_clip'))) {
      try {
        var clip = new LiveAPI('live_set view highlighted_clip_slot clip');
        if (clip.id && clip.id !== 0 && name) clip.set('name', name);
        if (clip.id && clip.id !== 0 && type === 'loop') clip.set('looping', 1);
      } catch (e2) { /* clip created; naming is best-effort */ }
      outlet(0, 'insert_result', 1);
      return;
    }
    stage(path);
  } catch (e) {
    stage(path);
  }
}

function stage(path) {
  outlet(1, 'stage', path);
  outlet(0, 'insert_result', 0);
}

// transport - one-shot snapshot for beat-synced audition in the sidebar.
function transport() {
  try {
    var song = new LiveAPI('live_set');
    outlet(0, 'transport',
      Number(song.get('is_playing')),
      Number(song.get('current_song_time')),
      Number(song.get('tempo')),
      Number(song.get('signature_numerator')));
  } catch (e) {
    outlet(0, 'transport', 0, 0, 120, 4);
  }
}
