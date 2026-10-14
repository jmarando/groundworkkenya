import { fillTemplate, type WaTemplate, type WaTemplateInput } from "@/lib/wa-templates";

export function WhatsAppTemplateFields({ templates, value, onChange, name = "friend", campaign = "[Campaign]", pollLink, disabled = false }: {
  templates: WaTemplate[]; value: WaTemplateInput; onChange: (value: WaTemplateInput) => void;
  name?: string | undefined; campaign?: string | undefined; pollLink?: string; disabled?: boolean;
}) {
  const t = templates.find((t) => t.name === value.template);
  if (!t) return null;
  const fields = pollLink ? [pollLink] : t.fields.map((_, i) => value.fields[i] ?? "");
  const preview = fillTemplate(t.text, [name, campaign, ...fields.map((f, i) => f || `[${t.fields[i]?.label}]`)]);
  return <div className="wa-template-fields">
    <label className="pb-field"><span>Approved WhatsApp template</span>
      <select disabled={disabled} value={value.template} onChange={(e) => onChange({ template: e.target.value, fields: [], imageUrl: "" })}>
        {templates.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
      </select>
    </label>
    {t.image && <label className="pb-field"><span>Picture link</span>
      <input type="url" disabled={disabled} value={value.imageUrl ?? ""} maxLength={480} placeholder="https://…" onChange={(e) => onChange({ ...value, imageUrl: e.target.value })} />
    </label>}
    {!pollLink && t.fields.map((f, i) => <label className="pb-field" key={f.label}><span>{f.label}</span>
      <input disabled={disabled} value={fields[i]} maxLength={200} placeholder={f.placeholder} onChange={(e) => { const next = [...fields]; next[i] = e.target.value; onChange({ ...value, fields: next }); }} />
    </label>)}
    <div className="wa-template-preview" aria-label="WhatsApp message preview">
      <span className="eyebrow">Message preview</span>
      {t.image && <p className="f-note">Picture header</p>}
      <p>{preview}</p>
    </div>
  </div>;
}