import { ArrowLeft, ChevronLeft, ChevronRight, CopyPlus, ExternalLink, Pencil, Scale, Star, Trash2 } from "lucide-react";
import { useEffect, useState, type TouchEvent } from "react";
import { RecipeArt } from "@/components/recipes/art";
import { RecipeEditor } from "@/components/recipes/editor";
import { meatLabel } from "@/lib/recipes/classify";
import { libraryMeats } from "@/lib/plans/grocery";
import { formatAmount, parseAmount, scaleRatio } from "@/lib/recipes/amount";
import { formatPublished } from "@/lib/recipes/format";
import { linesFromRecipe, scaleLines, type EditableLine, type VersionLink } from "@/lib/recipes/lines";
import { isMeatName } from "@/lib/sourced/meal";
import { ingredientGroups, macroPills, noteLines, postFallback, stepGroups, videoLinks } from "@/lib/recipes/present";
import type { Recipe, SlimRecipe } from "@/lib/recipes/types";

export function RecipeDetail({
  recipe,
  slim,
  versions,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onOpen,
  titleFor,
  makesFor,
  onNewVersion,
  onSave,
  onSaveAsNew,
  onRename,
  onDelete,
  onNotes,
  onFit,
  onToggleFavorite,
  addAction,
  resumeLines,
}: {
  recipe: Recipe;
  slim: SlimRecipe;
  versions: VersionLink[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onOpen: (uid: string) => void;
  titleFor: (uid: string) => string;
  makesFor: (uid: string) => string;
  onNewVersion: (notes: string) => Promise<void>;
  onSave: (lines: EditableLine[], notes: string, label: string) => Promise<void>;
  onSaveAsNew: (lines: EditableLine[], notes: string, label: string, stay?: boolean) => Promise<void>;
  onRename: (label: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onNotes: (notes: string) => Promise<void>;
  onFit: () => Promise<{ lines: EditableLine[]; note: string } | { error: string }>;
  onToggleFavorite: () => Promise<void>;
  addAction?: { label: string; onClick: () => void; onApply?: (lines: EditableLine[]) => void } | null;
  resumeLines?: EditableLine[] | null;
}) {
  const videos = videoLinks(recipe);
  const groups = ingredientGroups(recipe);
  const steps = stepGroups(recipe);
  const post = postFallback(recipe);
  const sourceNotes = noteLines(recipe);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState(false);
  const fromMeal = Array.isArray(resumeLines);
  const resumed = Boolean(resumeLines?.length);
  const opening = fromMeal ? meatFirst(resumed ? resumeLines : linesFromRecipe(recipe)) : [];
  const [mode, setMode] = useState<"edit" | "rebalance" | "fit" | null>(fromMeal ? "rebalance" : null);
  const [fitNote, setFitNote] = useState("");
  const [draft, setDraft] = useState<EditableLine[]>(() => opening);
  const [snapshot, setSnapshot] = useState<EditableLine[]>(() => (fromMeal ? linesFromRecipe(recipe) : []));
  const [baseId, setBaseId] = useState<string | null>(() => opening.find((row) => row.quantity)?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notes, setNotes] = useState(recipe.custom_notes ?? "");
  const [versionName, setVersionName] = useState(slim.versionLabel);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tool, setTool] = useState<"rebalance" | "edit" | null>(fromMeal ? "rebalance" : null);
  const isVersion = slim.isVersion;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && hasNext) onNext();
      if (event.key === "ArrowLeft" && hasPrev) onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onPrev, hasNext, hasPrev]);

  const onTouchEnd = (event: TouchEvent) => {
    const startX = Number(event.currentTarget.getAttribute("data-x") || "0");
    const startY = Number(event.currentTarget.getAttribute("data-y") || "0");
    const touch = event.changedTouches[0];
    if (!touch || !startX) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0 && hasNext) onNext();
    if (dx > 0 && hasPrev) onPrev();
  };

  const info = infoBits(recipe);
  const description = recipe.description?.trim() || "";
  const published = formatPublished(recipe.date_published);
  const author = recipe.author || recipe.created_by || "";

  const startMode = (next: "edit" | "rebalance") => {
    const rows = linesFromRecipe(recipe);
    setDraft(meatFirst(resumeLines?.length ? resumeLines : rows));
    setSnapshot(rows);
    setBaseId((resumeLines?.length ? meatFirst(resumeLines) : rows).find((row) => row.quantity)?.id ?? rows[0]?.id ?? null);
    setSaveError("");
    setFitNote("");
    setMode(next);
  };

  const runFit = async () => {
    setSaveError("");
    const result = await onFit();
    if ("error" in result) {
      setSaveError(result.error);
      return;
    }
    const rows = linesFromRecipe(recipe);
    setSnapshot(rows);
    setDraft(result.lines);
    setFitNote(result.note);
    setBaseId(null);
    setMode("fit");
  };

  useEffect(() => {
    setNotes(recipe.custom_notes ?? "");
    setVersionName(slim.versionLabel);
    setConfirmDelete(false);
  }, [recipe.uid, recipe.custom_notes, slim.versionLabel]);

  const commit = async (asNew: boolean) => {
    setSaving(true);
    setSaveError("");
    try {
      const rows = draft.filter((row) => row.quantity.trim() || row.unit.trim() || row.name.trim());
      if (asNew) await onSaveAsNew(rows, notes, versionName);
      else await onSave(rows, notes, versionName);
      setMode(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save that version.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-bg"
      data-x="0"
      data-y="0"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (!touch) return;
        event.currentTarget.setAttribute("data-x", String(touch.clientX));
        event.currentTarget.setAttribute("data-y", String(touch.clientY));
      }}
      onTouchEnd={onTouchEnd}
    >
      <div className="mx-auto min-h-full max-w-3xl">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-bg/90 px-2 py-2 backdrop-blur">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold">
            <ArrowLeft className="size-4" />
            Back
          </button>
          {isVersion ? (
            confirmDelete ? (
              <>
                <button type="button" onClick={() => void onDelete()} className="inline-flex h-11 items-center rounded-full bg-tomato px-3 text-sm font-semibold text-tomato-ink">
                  Delete {slim.versionLabel}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="inline-flex h-11 items-center rounded-full border border-line px-3 text-sm font-semibold">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
                <Trash2 className="size-4" />
                Delete
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => void onNewVersion(notes)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-tomato px-3 text-sm font-semibold text-tomato-ink"
            >
              <CopyPlus className="size-4" />
              New version
            </button>
          )}
          <div className="ml-auto flex items-center">
            <button
              type="button"
              onClick={() => void onToggleFavorite()}
              aria-pressed={Boolean(recipe.favorite)}
              aria-label={recipe.favorite ? "Remove favorite" : "Save as favorite"}
              className={`inline-flex size-11 items-center justify-center rounded-full ${recipe.favorite ? "text-gold" : ""}`}
            >
              <Star className={`size-5 ${recipe.favorite ? "fill-current" : ""}`} />
            </button>
            <button type="button" onClick={onPrev} disabled={!hasPrev} aria-label="Previous recipe" className="inline-flex size-11 items-center justify-center rounded-full disabled:opacity-30">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={onNext} disabled={!hasNext} aria-label="Next recipe" className="inline-flex size-11 items-center justify-center rounded-full disabled:opacity-30">
              <ChevronRight className="size-5" />
            </button>
          </div>
          {versions.length ? (
            <div className="flex basis-full gap-2 overflow-x-auto">
              <button
                type="button"
                aria-pressed={!isVersion}
                onClick={() => onOpen(slim.baseUid)}
                className={`h-11 shrink-0 rounded-full px-3 text-sm font-semibold ${isVersion ? "border border-line bg-surface" : "bg-tomato text-tomato-ink"}`}
              >
                Original
              </button>
              {versions.map((version) => (
                <button
                  key={version.uid}
                  type="button"
                  aria-pressed={recipe.uid === version.uid}
                  onClick={() => onOpen(version.uid)}
                  className={`h-11 shrink-0 rounded-full px-3 text-sm font-semibold ${recipe.uid === version.uid ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}
                >
                  {version.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="aspect-[16/10] max-h-[420px] w-full bg-line">
          <RecipeArt
            title={recipe.title}
            course={slim.course}
            thumb={slim.thumb}
            videoThumb={slim.videoThumb}
            custom={slim.custom}
            videoUrl={videos[0]?.url}
            eager
          />
        </div>

        <div className="flex flex-col gap-6 px-4 py-5 pb-16">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight">{recipe.title}</h2>
            {isVersion ? (
              <label className="mt-3 block">
                <span className="text-xs font-semibold tracking-wide text-muted uppercase">Version name</span>
                <input
                  value={versionName}
                  onChange={(event) => setVersionName(event.target.value)}
                  onBlur={() => {
                    const next = versionName.trim() || slim.versionLabel;
                    setVersionName(next);
                    if (next !== slim.versionLabel) void onRename(next);
                  }}
                  aria-label="Version name"
                  className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-tomato"
                />
              </label>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip>{slim.course}</Chip>
              {slim.proteins.map((protein) => (
                <Chip key={protein}>{meatLabel(protein)}</Chip>
              ))}
              <Chip>{slim.sourceLabel}</Chip>
              {slim.custom ? <Chip gold>Custom recipe</Chip> : null}
            </div>
            {info.length ? <p className="mt-3 text-sm text-muted">{info.join(" · ")}</p> : null}
          </div>

          <Nutrition recipe={recipe} />

          {description ? (
            <section>
              <p className={more ? "text-sm leading-relaxed" : "line-clamp-4 text-sm leading-relaxed"}>{description}</p>
              {description.length > 180 ? (
                <button type="button" onClick={() => setMore((value) => !value)} className="mt-1 text-sm font-semibold text-tomato">
                  {more ? "Less" : "More"}
                </button>
              ) : null}
            </section>
          ) : null}

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xl font-semibold">Ingredients</h3>
              {!mode ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void runFit()} className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
                    <Scale className="size-4" />
                    Fit to goal
                  </button>
                  {isVersion ? (
                    <>
                      <button type="button" onClick={() => startMode("rebalance")} className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
                        <Scale className="size-4" />
                        Rebalance
                      </button>
                      <button type="button" onClick={() => startMode("edit")} className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-semibold">
                        <Pencil className="size-4" />
                        Edit
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
            {mode && !tool ? (
              <div className="mt-3">
                <RecipeEditor
                  mode={mode}
                  lines={draft}
                  snapshot={snapshot}
                  baseId={baseId}
                  saving={saving}
                  error={saveError}
                  note={mode === "fit" ? fitNote : undefined}
                  hideUpdate={!isVersion}
                  newLabel={isVersion ? "Save as new version" : "Save as V1"}
                  onBase={(id) => {
                    setBaseId(id);
                    setDraft(snapshot.map((row) => ({ ...row })));
                  }}
                  onChange={(next) => {
                    if (mode === "rebalance" && baseId) {
                      const previous = draft.find((row) => row.id === baseId);
                      const updated = next.find((row) => row.id === baseId);
                      if (previous && updated && previous.quantity !== updated.quantity) {
                        setDraft(scaleLines(snapshot, baseId, updated.quantity));
                        return;
                      }
                    }
                    setDraft(next);
                  }}
                  onSave={() => void commit(false)}
                  onSaveAsNew={() => void commit(true)}
                  onCancel={() => {
                    setMode(null);
                    setSaveError("");
                    setFitNote("");
                  }}
                />
              </div>
            ) : (
              <>
            {!mode && saveError ? <p className="mt-2 text-sm text-tomato">{saveError}</p> : null}
            {groups.note ? <p className="mt-2 text-sm text-muted">{groups.note}</p> : null}
            {groups.groups.length ? (
              <div className="mt-3 flex flex-col gap-4">
                {groups.groups.map((group) => (
                  <div key={group.heading ?? group.lines[0]?.key}>
                    {group.heading ? <h4 className="mb-1 text-sm font-semibold">{group.heading}</h4> : null}
                    <ul>
                      {group.lines.map((line) => {
                        const on = Boolean(checked[line.key]);
                        return (
                          <li key={line.key} className="flex items-start gap-3 py-1.5">
                            <button
                              type="button"
                              aria-pressed={on}
                              aria-label={on ? "Mark not used" : "Mark used"}
                              onClick={() => setChecked((current) => ({ ...current, [line.key]: !current[line.key] }))}
                              className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-tomato bg-tomato text-tomato-ink" : "border-line"}`}
                            >
                              {on ? <span className="size-2 rounded-full bg-tomato-ink" /> : null}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={on ? "text-sm text-muted line-through" : "text-sm"}>
                                {line.text}
                                {line.sourcedRecipe && /\brecipe\b/i.test(line.text) && makesFor(line.sourcedRecipe) ? (
                                  <span className="font-semibold"> ({makesFor(line.sourcedRecipe)})</span>
                                ) : null}
                                {line.estimated ? <span className="ml-2 text-xs font-semibold tracking-wide text-muted uppercase">est.</span> : null}
                              </p>
                              {line.sourcedRecipe ? (
                                <button type="button" onClick={() => onOpen(line.sourcedRecipe!)} className="mt-0.5 block text-left text-xs text-tomato underline">
                                  {titleFor(line.sourcedRecipe)}
                                </button>
                              ) : null}
                              {line.sourcedMatch === "exact" && line.sourcedName ? <span className="mt-0.5 block text-xs text-muted">Library: {line.sourcedName}</span> : null}
                              {line.sourcedMatch === "closest" && line.sourcedName ? <span className="mt-0.5 block text-xs text-muted">Closest: {line.sourcedName}</span> : null}
                              {line.sourcedMatch === "zero" ? <span className="mt-0.5 block text-xs text-muted">Zero macros</span> : null}
                              {line.sourcedMatch === "none" ? <span className="mt-0.5 block text-xs text-muted">No library match</span> : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">No ingredient list. See the post text below.</p>
            )}
              </>
            )}
          </section>

          {steps.length ? (
            <section>
              <h3 className="font-display text-xl font-semibold">Steps</h3>
              <div className="mt-3 flex flex-col gap-4">
                {steps.map((group) => (
                  <div key={group.heading ?? group.steps[0]}>
                    {group.heading ? <h4 className="mb-1 text-sm font-semibold">{group.heading}</h4> : null}
                    <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
                      {group.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          ) : post ? (
            <section className="rounded-card border border-line bg-surface p-4">
              <h3 className="font-display text-xl font-semibold">From the post</h3>
              {post.text ? <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{post.text}</p> : null}
              {post.replies.map((reply) => (
                <div key={reply} className="mt-4 border-t border-line pt-3">
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">More from the thread</p>
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{reply}</p>
                </div>
              ))}
            </section>
          ) : null}

          <section>
            <h3 className="font-display text-xl font-semibold">Your notes</h3>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => {
                if (notes !== (recipe.custom_notes ?? "")) void onNotes(notes);
              }}
              rows={4}
              placeholder="Notes for this recipe"
              className="mt-2 w-full rounded-2xl border border-line bg-surface px-3 py-3 text-sm leading-relaxed outline-none focus:border-tomato"
            />
          </section>

          {sourceNotes.length ? (
            <section>
              <h3 className="font-display text-xl font-semibold">Source notes</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {sourceNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {recipe.url ? (
              <a href={recipe.url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full bg-tomato px-4 text-sm font-semibold text-tomato-ink">
                Open original
                <ExternalLink className="size-4" />
              </a>
            ) : null}
            {videos.map((video) => (
              <a key={video.url} href={video.url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold">
                {video.label}
              </a>
            ))}
          </div>

          <p className="text-sm text-muted">
            Source: {recipe.collection_name || slim.sourceLabel}
            {author ? ` · by ${author}` : ""}
            {published ? ` · published ${published}` : ""}
          </p>
          {addAction ? (
            <div className="sticky bottom-3 flex flex-col gap-2">
              <button type="button" onClick={() => { startMode("rebalance"); setTool("rebalance"); }} className="h-11 w-full rounded-full border border-line bg-surface text-sm font-semibold">
                Rebalance/edit
              </button>
              <button type="button" onClick={addAction.onClick} className="h-11 w-full rounded-full bg-tomato text-sm font-semibold text-tomato-ink">
                {addAction.label}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {tool && addAction?.onApply ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="Rebalance and edit">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
            <div className="flex gap-2">
              <button type="button" aria-pressed={tool === "rebalance"} onClick={() => { setTool("rebalance"); setMode("rebalance"); }} className={`h-11 flex-1 rounded-full text-sm font-semibold ${tool === "rebalance" ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}>
                Rebalance
              </button>
              <button type="button" aria-pressed={tool === "edit"} onClick={() => { setTool("edit"); setMode("edit"); }} className={`h-11 flex-1 rounded-full text-sm font-semibold ${tool === "edit" ? "bg-tomato text-tomato-ink" : "border border-line bg-surface"}`}>
                Edit
              </button>
            </div>
            <RecipeEditor
              mode={tool}
              lines={draft}
              snapshot={snapshot}
              baseId={baseId}
              saving={saving}
              error={saveError}
              hideUpdate
              newLabel={addAction.label}
              meatGroups={tool === "rebalance" ? libraryMeats() : undefined}
              searchAdd={tool === "edit"}
              onBase={(id) => {
                setBaseId(id);
                setDraft(meatFirst(snapshot.map((row) => ({ ...row }))));
              }}
              onChange={(next) => {
                if (tool === "rebalance" && baseId) {
                  const previous = draft.find((row) => row.id === baseId);
                  const updated = next.find((row) => row.id === baseId);
                  const origin = snapshot.find((row) => row.id === baseId);
                  if (previous && updated && origin && previous.quantity !== updated.quantity) {
                    const ratio = scaleRatio(origin.quantity, updated.quantity);
                    setDraft(meatFirst(next.map((row) => {
                      if (row.id === baseId) return { ...row, quantity: updated.quantity, name: updated.name, unit: updated.unit };
                      if (ratio == null) return row;
                      const source = snapshot.find((item) => item.id === row.id);
                      const amount = source ? parseAmount(source.quantity) : null;
                      if (amount == null) return row;
                      return { ...row, quantity: formatAmount(amount * ratio) };
                    })));
                    return;
                  }
                }
                setDraft(meatFirst(next));
              }}
              onSave={() => undefined}
              onSaveAsNew={() => addAction.onApply?.(draft.filter((row) => row.name.trim()))}
              onSaveTemplate={() => {
                setSaving(true);
                setSaveError("");
                void onSaveAsNew(draft.filter((row) => row.name.trim()), notes, "", true)
                  .catch((error: unknown) => setSaveError(error instanceof Error ? error.message : "Could not save the template."))
                  .finally(() => setSaving(false));
              }}
              onCancel={() => {
                setTool(null);
                setMode(null);
                setSaveError("");
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function meatFirst(lines: EditableLine[]): EditableLine[] {
  return [...lines.filter((line) => isMeatName(line.name)), ...lines.filter((line) => !isMeatName(line.name))];
}

function infoBits(recipe: Recipe): string[] {
  const bits: string[] = [];
  const written = recipe.yield?.trim() || "";
  const crepes = crepeCount(recipe);
  if (crepes) bits.push(crepes);
  if (written && !(crepes && /^\d+\s+servings?$/i.test(written))) bits.push(written);
  else if (!written && recipe.servings != null && String(recipe.servings).trim() && !crepes) bits.push(`${recipe.servings} servings`);
  if (recipe.serving_basis?.trim()) bits.push(recipe.serving_basis.trim());
  if (recipe.prep_time) bits.push(`Prep ${recipe.prep_time}`);
  if (recipe.cook_time) bits.push(`Cook ${recipe.cook_time}`);
  if (recipe.total_time) bits.push(`Total ${recipe.total_time}`);
  return bits;
}

function crepeCount(recipe: Recipe): string | null {
  const title = (recipe.title || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (!/\bcrepes?\b/.test(title)) return null;
  const written = (recipe.yield || "").trim();
  const pair = written.match(/(\d+)\s+servings?\s+(\d+)/i);
  if (pair) return `${Number(pair[1]) * Number(pair[2])} crepes`;
  const only = written.match(/^(\d+)\s+servings?$/i);
  if (only && only[1] === "12") return "12 crepes";
  return null;
}

function Nutrition({ recipe }: { recipe: Recipe }) {
  const nutrition = recipe.nutrition;
  if (!nutrition) return null;
  const pills = macroPills(recipe);
  const quotes = (nutrition.as_stated ?? []).map((quote) => quote.trim()).filter(Boolean);
  if (!pills && !quotes.length && !nutrition.raw && !nutrition.note) return null;
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h3 className="font-display text-xl font-semibold">Nutrition</h3>
      {pills ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {pills.map((pill) => (
              <div key={pill.label} className="min-w-20 rounded-2xl bg-bg px-3 py-2">
                <p className="text-xs text-muted">{pill.label}</p>
                <p className="font-semibold tabular-nums">{pill.value}</p>
              </div>
            ))}
          </div>
          {nutrition.serving_size ? <p className="mt-2 text-sm text-muted">per {nutrition.serving_size}</p> : null}
        </>
      ) : quotes.length ? (
        <ul className="mt-3 space-y-1 text-sm text-muted italic">
          {quotes.map((quote) => (
            <li key={quote}>{quote}</li>
          ))}
        </ul>
      ) : nutrition.raw ? (
        <p className="mt-3 text-sm text-muted">{nutrition.raw}</p>
      ) : null}
      {nutrition.note && !quotes.length ? <p className="mt-2 text-sm text-muted">{nutrition.note}</p> : null}
    </section>
  );
}

function Chip({ children, gold = false }: { children: string; gold?: boolean }) {
  return (
    <span className={gold ? "rounded-full bg-gold-bg px-2.5 py-1 text-xs font-semibold text-gold" : "rounded-full bg-chip px-2.5 py-1 text-xs font-medium"}>
      {children}
    </span>
  );
}
