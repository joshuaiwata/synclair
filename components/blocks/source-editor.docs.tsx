import { live, scene, type ComponentDoc } from "@/lib/system/doc-types"

/**
 * SourceEditor wires a page-level slide-over to server actions, so its example
 * renders the real block via its standalone preview scene: real skill rows,
 * the real sheet, the real read/save actions. Click a row — it works.
 */
const doc: ComponentDoc = {
  intent:
    "Lets a human safely edit one markdown source file (a skill, an agent definition) from inside the hub without leaving for an editor — while making an accidental overwrite structurally hard: one sheet per page, explicit confirm before write. Use it wherever a table row represents an editable file; don't use it for structured data (build a form) or multi-file edits.",
  examples: [
    {
      title: "Live",
      description:
        "Real skill rows wired to the real server actions — click a row to open the sheet, Preview/Edit tabs and confirm-to-save included.",
      preview: scene("source-editor", { height: 420 }),
      code: `<SourceEditorProvider>
  <Table>
    <TableBody>
      {items.map((item) => <SourceRow key={item.name} item={item} />)}
    </TableBody>
  </Table>
</SourceEditorProvider>`,
    },
  ],
  states: [
    {
      name: "Loading",
      description: "Spinner while the file is read via the `readSource` server action.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border p-4 text-sm">Loading…</div>
      ),
    },
    {
      name: "Preview / Edit",
      description: "Rendered markdown vs. a mono textarea, switched by tabs.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border p-4 text-sm">
          Preview (markdown) · Edit (textarea)
        </div>
      ),
    },
    {
      name: "Confirm save",
      description: "Save is two-step — an explicit 'Overwrite this file?' confirm before writing.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border p-4 text-sm">
          Overwrite this file? · Confirm save
        </div>
      ),
    },
    {
      name: "Error",
      description: "Read/write failures surface inline in the destructive color.",
      preview: live(
        <div className="bg-card text-destructive rounded-md border p-4 text-sm">Failed to load file</div>
      ),
    },
  ],
  interactions: [
    {
      trigger: "Click a SourceRow",
      behavior: "Opens the shared sheet and lazy-loads the file via the readSource server action.",
      result: "Opening a different row swaps the active file — sheets never stack.",
    },
    {
      trigger: "Switch Preview / Edit tabs",
      behavior: "Toggles rendered markdown vs. a mono textarea over the same content.",
    },
    {
      trigger: "Click Save",
      behavior: "Shows the explicit 'Overwrite this file?' confirm step.",
      result: "Confirm writes via the saveSource server action; cancel returns to editing.",
    },
    {
      trigger: "Close the sheet",
      behavior: "Discards unsaved edits; nothing is written without the confirm step.",
      keyboard: "Esc",
    },
  ],
  responsive: [
    { viewport: "mobile", behavior: "Sheet takes the full width; tabs stay atop the content." },
    { viewport: "tablet", behavior: "Slide-over panel over the page content." },
    { viewport: "desktop", behavior: "Fixed-width slide-over from the right; page stays visible behind it." },
  ],
  props: [
    {
      name: "SourceEditorProvider · children",
      type: "ReactNode",
      description: "Owns the single sheet for the page; wrap the rows in it.",
    },
    {
      name: "SourceRow · item",
      type: "SourceItem",
      description:
        "{ kind, name, source, layer, summary, file } — the row that opens the editor. `layer` drives the Synclair/Project origin badge.",
    },
  ],
  notes:
    "One sheet per page: opening a different row swaps the active file rather than stacking sheets, so a save can only ever target the file currently shown. Saving requires explicit confirmation. Reads/writes go through the `readSource` / `saveSource` server actions.",
}

export default doc
