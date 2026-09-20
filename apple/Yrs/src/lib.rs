//! The Yjs engine behind native realtime collaboration.
//!
//! This is yrs (the Rust port of Yjs, wire compatible with the web's `yjs`)
//! shaped to exactly one schema: the canvas document written by
//! `src/collaboration/yjsCanvas.ts`. Six root maps — `canvas`, `widgets`,
//! `relations`, `connections`, `glues`, `texts` — where every record is a
//! nested `Y.Map` of JSON fields and every widget's string `text` lives in
//! `texts` as a `Y.Text`.
//!
//! Swift never holds a yrs transaction. Each call opens one, applies a batch of
//! edits the way `writeCanvasSnapshot` does, and hands back the binary update
//! that transaction produced, so there are no callbacks from Rust into Swift
//! and no re-entrancy to reason about.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use yrs::types::ToJson;
use yrs::undo::Options as UndoOptions;
use yrs::updates::decoder::Decode;
use yrs::{
    Any, Doc, GetString, Map, MapPrelim, MapRef, OffsetKind, Options, Origin, Out, ReadTxn,
    ClientID, StateVector, Text, TextPrelim, TextRef, Transact, TransactionMut, UndoManager,
    Update,
};

uniffi::setup_scaffolding!();

const ROOT_CANVAS: &str = "canvas";
const ROOT_WIDGETS: &str = "widgets";
const ROOT_RELATIONS: &str = "relations";
const ROOT_CONNECTIONS: &str = "connections";
const ROOT_GLUES: &str = "glues";
const ROOT_TEXTS: &str = "texts";

/// The web's `LOCAL_STORE_ORIGIN`: edits made by this person through the
/// board. Only these are tracked by collaborative undo.
const LOCAL_ORIGIN: &str = "grovepad-local-store";
/// The web's `REMOTE_TRANSPORT_ORIGIN`: everything that arrived over the wire
/// or from a cache.
const REMOTE_ORIGIN: &str = "grovepad-remote-transport";

/// `captureTimeout` of the web's `Y.UndoManager`.
const UNDO_CAPTURE_TIMEOUT_MS: u64 = 350;

/// Why a call into the engine failed.
#[derive(Debug, uniffi::Error)]
pub enum CrdtError {
    /// An incoming update could not be decoded or applied.
    Update { message: String },
    /// A field value was not valid JSON.
    Json { message: String },
}

impl std::fmt::Display for CrdtError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CrdtError::Update { message } => write!(f, "{message}"),
            CrdtError::Json { message } => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for CrdtError {}

/// The four record collections. Canvas metadata and note text have their own
/// edits.
#[derive(Debug, Clone, Copy, uniffi::Enum)]
pub enum CrdtRoot {
    /// `widgets` — widget records without their collaborative `data.text`.
    Widgets,
    /// `relations`
    Relations,
    /// `connections`
    Connections,
    /// `glues`
    Glues,
}

/// One JSON-valued field of a record.
#[derive(Debug, Clone, uniffi::Record)]
pub struct CrdtField {
    /// The property name.
    pub key: String,
    /// The value, as JSON text.
    pub json: String,
}

/// One record read out of the document.
#[derive(Debug, Clone, uniffi::Record)]
pub struct CrdtRecord {
    /// The key under the root map (the record id).
    pub id: String,
    /// Every field, as JSON.
    pub fields: Vec<CrdtField>,
}

/// One collaborative note body.
#[derive(Debug, Clone, uniffi::Record)]
pub struct CrdtText {
    /// The widget id it belongs to.
    pub id: String,
    /// The text.
    pub text: String,
    /// Length in UTF-16 code units, the unit JavaScript's `Y.Text.length` uses.
    pub utf16_length: u32,
}

/// Everything in the document, unvalidated. Swift runs it through the board
/// parser before it reaches the store, as `readCanvasSnapshot` does.
#[derive(Debug, Clone, uniffi::Record)]
pub struct CrdtSnapshot {
    /// `canvas` root fields.
    pub canvas: Vec<CrdtField>,
    /// Record counts per root, including entries that are not maps (the web
    /// bounds `root.size`, not the number of usable records).
    pub widget_count: u32,
    /// See `widget_count`.
    pub relation_count: u32,
    /// See `widget_count`.
    pub connection_count: u32,
    /// See `widget_count`.
    pub glue_count: u32,
    /// See `widget_count`.
    pub text_count: u32,
    /// Widget records (entries that are `Y.Map`s).
    pub widgets: Vec<CrdtRecord>,
    /// Relation records.
    pub relations: Vec<CrdtRecord>,
    /// Connection records.
    pub connections: Vec<CrdtRecord>,
    /// Glue records.
    pub glues: Vec<CrdtRecord>,
    /// Note bodies (entries that are `Y.Text`s).
    pub texts: Vec<CrdtText>,
}

/// One step of a local write, mirroring `writeCanvasSnapshot`.
#[derive(Debug, Clone, uniffi::Enum)]
pub enum CrdtEdit {
    /// `replaceMapFields(doc.getMap('canvas'), fields)`.
    ReplaceCanvas {
        /// The complete field set.
        fields: Vec<CrdtField>,
    },
    /// Make `root[id]` a map holding exactly `fields` (`reconcileRecords`
    /// body): absent keys are deleted, a field is only written when its value
    /// actually changed, so unrelated concurrent edits merge.
    ReplaceRecord {
        /// Which collection.
        root: CrdtRoot,
        /// The record id.
        id: String,
        /// The complete field set.
        fields: Vec<CrdtField>,
    },
    /// `root.delete(id)`.
    DeleteRecord {
        /// Which collection.
        root: CrdtRoot,
        /// The record id.
        id: String,
    },
    /// Make `texts[id]` a `Y.Text` holding `text`, applied as one splice
    /// between the common prefix and suffix (`replaceText`).
    ReplaceText {
        /// The widget id.
        id: String,
        /// The whole new text.
        text: String,
    },
    /// `texts.delete(id)`.
    DeleteText {
        /// The widget id.
        id: String,
    },
    /// Delete every key of `root` not in `ids` (a first write with no previous
    /// snapshot walks `root.keys()`).
    RetainRecords {
        /// Which collection.
        root: CrdtRoot,
        /// The ids that stay.
        ids: Vec<String>,
    },
    /// Delete every `texts` key not in `ids`.
    RetainTexts {
        /// The widget ids whose text stays.
        ids: Vec<String>,
    },
}

fn retain_keys(txn: &mut TransactionMut, target: &MapRef, ids: &[String]) {
    let keep: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let stale: Vec<String> = target
        .keys(txn)
        .filter(|key| !keep.contains(key))
        .map(str::to_owned)
        .collect();
    for key in stale {
        target.remove(txn, &key);
    }
}

struct Engine {
    doc: Doc,
    canvas: MapRef,
    widgets: MapRef,
    relations: MapRef,
    connections: MapRef,
    glues: MapRef,
    texts: MapRef,
    undo: UndoManager,
    produced: Arc<Mutex<Vec<Vec<u8>>>>,
}

/// One canvas's shared document plus its collaborative undo manager.
#[derive(uniffi::Object)]
pub struct CanvasCrdt {
    engine: Mutex<Engine>,
}

fn origin(name: &str) -> Origin {
    Origin::from(name)
}

fn parse_json(json: &str) -> Result<Any, CrdtError> {
    Any::from_json(json).map_err(|error| CrdtError::Json { message: error.to_string() })
}

fn any_to_json(value: &Any) -> String {
    let mut buffer = String::new();
    value.to_json(&mut buffer);
    buffer
}

fn out_to_json<T: ReadTxn>(value: &Out, txn: &T) -> String {
    any_to_json(&value.to_json(txn))
}

fn replace_map_fields(
    txn: &mut TransactionMut,
    target: &MapRef,
    fields: &[CrdtField],
) -> Result<(), CrdtError> {
    let mut wanted: Vec<(String, Any)> = Vec::with_capacity(fields.len());
    for field in fields {
        wanted.push((field.key.clone(), parse_json(&field.json)?));
    }
    let keep: HashSet<&str> = wanted.iter().map(|(key, _)| key.as_str()).collect();
    let stale: Vec<String> = target
        .keys(txn)
        .filter(|key| !keep.contains(key))
        .map(str::to_owned)
        .collect();
    for key in stale {
        target.remove(txn, &key);
    }
    for (key, value) in wanted {
        let unchanged = match target.get(txn, &key) {
            Some(Out::Any(existing)) => existing == value,
            _ => false,
        };
        if !unchanged {
            target.insert(txn, key, value);
        }
    }
    Ok(())
}

fn utf16_len(text: &str) -> u32 {
    text.encode_utf16().count() as u32
}

/// `replaceText`: one delete and one insert between the common prefix and
/// suffix. Compared by Unicode scalar so a splice never cuts a surrogate pair,
/// then converted to the UTF-16 offsets the document counts in.
fn replace_text(txn: &mut TransactionMut, target: &TextRef, next: &str) {
    let previous = target.get_string(txn);
    if previous == next {
        return;
    }
    let old: Vec<char> = previous.chars().collect();
    let new: Vec<char> = next.chars().collect();
    let mut prefix = 0;
    let prefix_limit = old.len().min(new.len());
    while prefix < prefix_limit && old[prefix] == new[prefix] {
        prefix += 1;
    }
    let mut suffix = 0;
    let suffix_limit = (old.len() - prefix).min(new.len() - prefix);
    while suffix < suffix_limit && old[old.len() - suffix - 1] == new[new.len() - suffix - 1] {
        suffix += 1;
    }
    let units = |chars: &[char]| chars.iter().map(|c| c.len_utf16() as u32).sum::<u32>();
    let start = units(&old[..prefix]);
    let delete_count = units(&old[prefix..old.len() - suffix]);
    if delete_count > 0 {
        target.remove_range(txn, start, delete_count);
    }
    let inserted: String = new[prefix..new.len() - suffix].iter().collect();
    if !inserted.is_empty() {
        target.insert(txn, start, &inserted);
    }
}

fn read_records<T: ReadTxn>(root: &MapRef, txn: &T) -> (u32, Vec<CrdtRecord>) {
    let mut records = Vec::new();
    for (id, value) in root.iter(txn) {
        let Out::YMap(entity) = value else { continue };
        let fields = entity
            .iter(txn)
            .map(|(key, value)| CrdtField { key: key.to_owned(), json: out_to_json(&value, txn) })
            .collect();
        records.push(CrdtRecord { id: id.to_owned(), fields });
    }
    (root.len(txn), records)
}

impl Engine {
    fn root(&self, root: CrdtRoot) -> &MapRef {
        match root {
            CrdtRoot::Widgets => &self.widgets,
            CrdtRoot::Relations => &self.relations,
            CrdtRoot::Connections => &self.connections,
            CrdtRoot::Glues => &self.glues,
        }
    }

    fn drain(&self) -> Vec<u8> {
        let mut produced = self.produced.lock().unwrap();
        let updates: Vec<Vec<u8>> = produced.drain(..).collect();
        match updates.len() {
            0 => Vec::new(),
            1 => updates.into_iter().next().unwrap(),
            _ => yrs::merge_updates_v1(&updates).unwrap_or_default(),
        }
    }
}

#[uniffi::export]
impl CanvasCrdt {
    /// A fresh document. Swift passes a random 32-bit `client_id`, the range
    /// `new Y.Doc()` draws from, so awareness ids stay small JavaScript numbers.
    #[uniffi::constructor]
    pub fn new(client_id: u64) -> Arc<Self> {
        let options = Options {
            offset_kind: OffsetKind::Utf16,
            client_id: ClientID::new(client_id),
            ..Options::default()
        };
        let doc = Doc::with_options(options);
        let canvas = doc.get_or_insert_map(ROOT_CANVAS);
        let widgets = doc.get_or_insert_map(ROOT_WIDGETS);
        let relations = doc.get_or_insert_map(ROOT_RELATIONS);
        let connections = doc.get_or_insert_map(ROOT_CONNECTIONS);
        let glues = doc.get_or_insert_map(ROOT_GLUES);
        let texts = doc.get_or_insert_map(ROOT_TEXTS);

        let mut tracked = HashSet::new();
        tracked.insert(origin(LOCAL_ORIGIN));
        let mut undo = UndoManager::with_options(UndoOptions {
            capture_timeout_millis: UNDO_CAPTURE_TIMEOUT_MS,
            tracked_origins: tracked,
            ..UndoOptions::default()
        });
        for scope in [&widgets, &canvas, &relations, &connections, &glues, &texts] {
            undo.expand_scope(&doc, scope);
        }

        let produced: Arc<Mutex<Vec<Vec<u8>>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = produced.clone();
        let remote = origin(REMOTE_ORIGIN);
        doc.observe_update_v1("grovepad-produced", move |txn, event| {
                if txn.origin() == Some(&remote) {
                    return;
                }
                sink.lock().unwrap().push(event.update.clone());
            })
            .expect("a fresh document accepts observers");

        Arc::new(CanvasCrdt {
            engine: Mutex::new(Engine {
                doc,
                canvas,
                widgets,
                relations,
                connections,
                glues,
                texts,
                undo,
                produced,
            }),
        })
    }

    /// `doc.clientID`, also the awareness client id.
    pub fn client_id(&self) -> u64 {
        self.engine.lock().unwrap().doc.client_id().get()
    }

    /// Apply this person's edits in one transaction with the local-store
    /// origin. Returns the update to send, empty when nothing changed.
    pub fn apply_local_edits(&self, edits: Vec<CrdtEdit>) -> Result<Vec<u8>, CrdtError> {
        self.apply_edits(edits, LOCAL_ORIGIN)
    }

    /// Apply edits that must not be undoable or re-sent (the empty-canvas seed
    /// a read-only role writes when the server has nothing yet).
    pub fn apply_remote_edits(&self, edits: Vec<CrdtEdit>) -> Result<(), CrdtError> {
        self.apply_edits(edits, REMOTE_ORIGIN).map(|_| ())
    }

    /// `Y.applyUpdate(doc, update, REMOTE_TRANSPORT_ORIGIN)`.
    pub fn apply_remote_update(&self, update: Vec<u8>) -> Result<(), CrdtError> {
        let engine = self.engine.lock().unwrap();
        let decoded = Update::decode_v1(&update)
            .map_err(|error| CrdtError::Update { message: error.to_string() })?;
        let mut txn = engine.doc.transact_mut_with(origin(REMOTE_ORIGIN));
        txn.apply_update(decoded)
            .map_err(|error| CrdtError::Update { message: error.to_string() })?;
        Ok(())
    }

    /// `Y.encodeStateAsUpdate(doc)`.
    pub fn encode_state_as_update(&self) -> Vec<u8> {
        let engine = self.engine.lock().unwrap();
        let txn = engine.doc.transact();
        txn.encode_state_as_update_v1(&StateVector::default())
    }

    /// Everything the document holds, for validation.
    pub fn read_snapshot(&self) -> CrdtSnapshot {
        let engine = self.engine.lock().unwrap();
        let txn = engine.doc.transact();
        let canvas = engine
            .canvas
            .iter(&txn)
            .map(|(key, value)| CrdtField { key: key.to_owned(), json: out_to_json(&value, &txn) })
            .collect();
        let (widget_count, widgets) = read_records(&engine.widgets, &txn);
        let (relation_count, relations) = read_records(&engine.relations, &txn);
        let (connection_count, connections) = read_records(&engine.connections, &txn);
        let (glue_count, glues) = read_records(&engine.glues, &txn);
        let mut texts = Vec::new();
        for (id, value) in engine.texts.iter(&txn) {
            let Out::YText(text) = value else { continue };
            let string = text.get_string(&txn);
            let utf16_length = utf16_len(&string);
            texts.push(CrdtText { id: id.to_owned(), text: string, utf16_length });
        }
        CrdtSnapshot {
            canvas,
            widget_count,
            relation_count,
            connection_count,
            glue_count,
            text_count: engine.texts.len(&txn),
            widgets,
            relations,
            connections,
            glues,
            texts,
        }
    }

    /// Collaborative undo of this person's last captured change. Returns the
    /// update to send (empty when there was nothing to undo).
    pub fn undo(&self) -> Vec<u8> {
        let mut engine = self.engine.lock().unwrap();
        engine.produced.lock().unwrap().clear();
        engine.undo.undo_blocking();
        engine.drain()
    }

    /// Collaborative redo.
    pub fn redo(&self) -> Vec<u8> {
        let mut engine = self.engine.lock().unwrap();
        engine.produced.lock().unwrap().clear();
        engine.undo.redo_blocking();
        engine.drain()
    }

    /// Whether `undo` would do anything.
    pub fn can_undo(&self) -> bool {
        self.engine.lock().unwrap().undo.can_undo()
    }

    /// Whether `redo` would do anything.
    pub fn can_redo(&self) -> bool {
        self.engine.lock().unwrap().undo.can_redo()
    }

    /// `undoManager.clear()`.
    pub fn clear_undo_history(&self) {
        self.engine.lock().unwrap().undo.clear_all();
    }
}

impl CanvasCrdt {
    fn apply_edits(&self, edits: Vec<CrdtEdit>, origin_name: &str) -> Result<Vec<u8>, CrdtError> {
        let engine = self.engine.lock().unwrap();
        engine.produced.lock().unwrap().clear();
        {
            let mut txn = engine.doc.transact_mut_with(origin(origin_name));
            for edit in &edits {
                match edit {
                    CrdtEdit::ReplaceCanvas { fields } => {
                        replace_map_fields(&mut txn, &engine.canvas, fields)?;
                    }
                    CrdtEdit::ReplaceRecord { root, id, fields } => {
                        let parent = engine.root(*root);
                        let entity = match parent.get(&txn, id) {
                            Some(Out::YMap(entity)) => entity,
                            _ => parent.insert(&mut txn, id.clone(), MapPrelim::default()),
                        };
                        replace_map_fields(&mut txn, &entity, fields)?;
                    }
                    CrdtEdit::DeleteRecord { root, id } => {
                        engine.root(*root).remove(&mut txn, id);
                    }
                    CrdtEdit::ReplaceText { id, text } => {
                        let target = match engine.texts.get(&txn, id) {
                            Some(Out::YText(target)) => target,
                            _ => engine.texts.insert(&mut txn, id.clone(), TextPrelim::new("")),
                        };
                        replace_text(&mut txn, &target, text);
                    }
                    CrdtEdit::DeleteText { id } => {
                        engine.texts.remove(&mut txn, id);
                    }
                    CrdtEdit::RetainRecords { root, ids } => {
                        retain_keys(&mut txn, engine.root(*root), ids);
                    }
                    CrdtEdit::RetainTexts { ids } => {
                        retain_keys(&mut txn, &engine.texts, ids);
                    }
                }
            }
        }
        Ok(engine.drain())
    }
}

/// `Y.mergeUpdates`: the offline queue folds long bursts into one update.
#[uniffi::export]
pub fn merge_updates(updates: Vec<Vec<u8>>) -> Result<Vec<u8>, CrdtError> {
    yrs::merge_updates_v1(&updates).map_err(|error| CrdtError::Update { message: error.to_string() })
}
