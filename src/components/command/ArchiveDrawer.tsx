// ArchiveDrawer — browse + search archived units.
//
// Phase 7 deliverable: lists all archived sessions; FTS5 search
// across persisted transcripts (user/agent_text/agent_thought/system).
// Clicking a row restores the unit to the tactical field as a
// `isLive: false` placeholder — the user clicks Resume on its chat
// panel to actually re-spawn the agent. This keeps the restore
// non-destructive: if the user just wanted to read the history,
// no wrapper is spawned.

import { Search, Plug, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  commandDeleteSession,
  commandListArchivedSessions,
  commandListMessages,
  commandSearchArchive,
  commandUnarchiveSession,
  type ArchiveSearchHit,
  type StoredSession,
} from "@/lib/tauri/command";
import { useCommandStore } from "@/stores/command/store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ArchiveRow {
  session: StoredSession;
  snippet?: string;
  snippetKind?: string;
}

const SEARCH_DEBOUNCE_MS = 220;
const BACKEND_LABEL: Record<string, string> = {
  claudeAcp: "Claude",
  geminiAcp: "Gemini",
  codexAcp: "Codex",
  qwenAcp: "Qwen",
};

export function ArchiveDrawer({ open, onOpenChange }: Props) {
  const hydrateFromStorage = useCommandStore((s) => s.hydrateFromStorage);
  const existingUnits = useCommandStore((s) => s.units);
  const existingOrder = useCommandStore((s) => s.unitOrder);
  const selectUnit = useCommandStore((s) => s.selectUnit);

  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState<StoredSession[]>([]);
  const [hits, setHits] = useState<ArchiveSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await commandListArchivedSessions();
      setArchived(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load archived sessions whenever the drawer opens.
  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  // Debounced search. Empty query → no search hits.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length === 0) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      commandSearchArchive(q, 40)
        .then((r) => setHits(r))
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, open]);

  const rows: ArchiveRow[] = useMemo(() => {
    const q = query.trim();
    if (q.length === 0) {
      return archived.map((s) => ({ session: s }));
    }
    // Dedup hits to first match per session, keep snippet.
    const matchedIds = new Set<string>();
    const out: ArchiveRow[] = [];
    for (const h of hits) {
      if (matchedIds.has(h.sessionId)) continue;
      matchedIds.add(h.sessionId);
      const session = archived.find((a) => a.id === h.sessionId);
      if (!session) continue;
      out.push({
        session,
        snippet: h.snippet,
        snippetKind: h.messageKind,
      });
    }
    return out;
  }, [query, archived, hits]);

  const restore = useCallback(
    async (session: StoredSession) => {
      try {
        await commandUnarchiveSession(session.id);
        // Re-hydrate the store with the existing live units PLUS the
        // newly-unarchived one. `hydrateFromStorage` replaces the
        // map wholesale, so collect the existing units first.
        const carry: StoredSession[] = existingOrder
          .map((id) => existingUnits[id])
          .filter((u): u is NonNullable<typeof u> => !!u)
          .map((u) => ({
            id: u.id,
            name: u.name,
            spriteId: u.spriteId,
            role: u.role,
            projectId: u.projectId,
            backend: u.backend,
            modelId: u.modelId,
            state: u.state,
            acpSessionId: u.acpSessionId,
            rolePrompt: u.rolePrompt,
            positionX: u.positionX,
            positionY: u.positionY,
            facing: u.facing8,
            anchorX: u.anchorX,
            anchorY: u.anchorY,
            createdAt: u.createdAt,
            lastActiveAt: u.lastActiveAt,
            archived: false,
          }));
        const restoredMessages = await commandListMessages(session.id).catch(
          () => [],
        );
        // Existing units keep their in-memory transcripts; only the
        // restored session needs hydrated messages.
        const messagesBySession: Record<string, typeof restoredMessages> = {
          [session.id]: restoredMessages,
        };
        for (const u of existingOrder) {
          const unit = existingUnits[u];
          if (!unit) continue;
          messagesBySession[u] = unit.transcript.map((t) => ({
            id: t.id,
            sessionId: u,
            seq: 0,
            kind: t.kind,
            text: t.text,
            createdAt: t.createdAt,
          }));
        }
        hydrateFromStorage([...carry, session], messagesBySession);
        selectUnit(session.id);
        toast.success(`Restored ${session.name}`);
        onOpenChange(false);
      } catch (e) {
        toast.error(
          `Restore failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [
      existingOrder,
      existingUnits,
      hydrateFromStorage,
      onOpenChange,
      selectUnit,
    ],
  );

  const remove = useCallback(
    async (sessionId: string) => {
      try {
        await commandDeleteSession(sessionId);
        setArchived((prev) => prev.filter((a) => a.id !== sessionId));
        setHits((prev) => prev.filter((h) => h.sessionId !== sessionId));
        toast.success("Deleted permanently");
      } catch (e) {
        toast.error(
          `Delete failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] w-[640px] max-w-[90vw] flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Archive</DialogTitle>
          <DialogDescription>
            Previously-deployed units and their transcripts. Search by content
            or restore a unit back to the tactical field.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcripts…"
            className="bg-black/30 pl-8 pr-8"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-white/10"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-700/60 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && rows.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {query.trim().length === 0
                ? "No archived units yet."
                : `No matches for "${query.trim()}"`}
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {rows.map((row) => (
                <ArchiveRowItem
                  key={row.session.id}
                  row={row}
                  onRestore={() => void restore(row.session)}
                  onDelete={() => void remove(row.session.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveRowItem({
  row,
  onRestore,
  onDelete,
}: {
  row: ArchiveRow;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { session, snippet, snippetKind } = row;
  const lastActive = relativeAge(session.lastActiveAt);
  return (
    <li className="group flex items-start gap-2 px-1.5 py-2 hover:bg-white/[0.03]">
      <button
        type="button"
        onClick={onRestore}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{session.name}</span>
          <span className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
            {BACKEND_LABEL[session.backend] ?? session.backend}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {session.role}
          </span>
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {lastActive} · {session.projectId}
        </div>
        {snippet && (
          <div className="mt-1 line-clamp-2 break-words text-xs text-white/70">
            <span className="mr-1 rounded bg-white/5 px-1 py-0.5 text-[9px] uppercase text-white/40">
              {snippetKind ?? "match"}
            </span>
            {snippet}
          </div>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={onRestore}
        >
          <Plug className="mr-1 h-3 w-3" /> Restore
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] text-red-300/80 hover:bg-red-500/10"
          onClick={onDelete}
          aria-label="Delete permanently"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </li>
  );
}

function relativeAge(ms: number): string {
  const delta = Date.now() - ms;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
