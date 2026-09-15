import { get as idbGet, set as idbSet } from "idb-keyval";

/*
  Storage layer used by App.jsx. Exposes three functions:

    getData()                  -> returns the saved value, or null
    setData(value)              -> saves the value
    subscribeToChanges(cb)      -> calls cb(newValue) whenever another
                                    device saves a change; returns an
                                    unsubscribe function

  Two modes, chosen automatically:

  1. LOCAL MODE (default, no setup needed)
     Data lives only on this device (IndexedDB). No live sharing between
     phones. This is what you get until Supabase credentials are added.

  2. SHARED MODE (once .env has Supabase credentials)
     Data lives in a Supabase table and is shared by every device that
     opens the app. Changes on one phone appear on the other within a
     couple of seconds through Supabase's realtime feature.

  Nothing else in App.jsx needs to change between the two modes.
*/

const RECORD_KEY = "shop-data-v1";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SHARED_MODE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let supabase = null;
if (SHARED_MODE) {
  // Lazily imported so local-mode users never need this package configured.
  const { createClient } = await import("@supabase/supabase-js");
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export const isSharedMode = SHARED_MODE;

export async function getData() {
  if (SHARED_MODE) {
    const { data, error } = await supabase
      .from("shop_data")
      .select("value")
      .eq("id", RECORD_KEY)
      .maybeSingle();
    if (error) {
      console.error("Supabase read failed", error);
      return null;
    }
    return data ? data.value : null;
  }
  const value = await idbGet(RECORD_KEY);
  return value === undefined ? null : JSON.parse(value);
}

export async function setData(value) {
  if (SHARED_MODE) {
    const { error } = await supabase
      .from("shop_data")
      .upsert({ id: RECORD_KEY, value, updated_at: new Date().toISOString() });
    if (error) console.error("Supabase write failed", error);
    return;
  }
  await idbSet(RECORD_KEY, JSON.stringify(value));
}

export function subscribeToChanges(callback) {
  if (!SHARED_MODE) {
    // Nothing to subscribe to in local mode.
    return () => {};
  }
  const channel = supabase
    .channel("shop_data_changes")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "shop_data", filter: `id=eq.${RECORD_KEY}` },
      (payload) => {
        if (payload.new && payload.new.value) callback(payload.new.value);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* -----------------------------------------------------------------------
   ATTACHMENTS (receipts, bills, invoices — photos or PDFs)

   uploadAttachment(file, id) stores the file and returns a reference you
   save on the sale/expense record: { id, kind: 'image'|'pdf', url }.

   - SHARED MODE: uploads to a Supabase Storage bucket called "receipts"
     and returns its public URL directly. This url is stored as plain
     text on the record and works everywhere, no extra lookup needed.
   - LOCAL MODE: the file is stored on-device in IndexedDB under
     "attachment:<id>". The record stores url: "local:<id>", and
     resolveLocalAttachment(id) below turns that back into something
     the browser can display, on this device only.
----------------------------------------------------------------------- */

function attachmentKind(file) {
  return file.type === "application/pdf" ? "pdf" : "image";
}

export async function uploadAttachment(file, id) {
  const kind = attachmentKind(file);

  if (SHARED_MODE) {
    const path = `${id}-${file.name}`.replace(/\s+/g, "_");
    const { error } = await supabase.storage.from("receipts").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (error) {
      console.error("Attachment upload failed", error);
      throw error;
    }
    const { data } = supabase.storage.from("receipts").getPublicUrl(path);
    return { id, kind, url: data.publicUrl };
  }

  await idbSet(`attachment:${id}`, file);
  return { id, kind, url: `local:${id}` };
}

// Turns a "local:<id>" reference back into a displayable blob URL.
// Only works on the device the file was originally attached on.
export async function resolveLocalAttachment(localRef) {
  const id = localRef.replace("local:", "");
  const blob = await idbGet(`attachment:${id}`);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
