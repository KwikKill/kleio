"use client";

import { PRESETS } from "@/lib/lanes";

interface Props {
  top: number;
  active: string[];
  counts: Record<string, number>;
  dark: boolean;
  onToggle: (id: string) => void;
  onNewCustom: () => void;
  onClose: () => void;
}

const GROUPS = ["Personnes", "Événements", "Temps profond"] as const;

export default function LanePicker({ top, active, counts, dark, onToggle, onNewCustom, onClose }: Props) {
  return (
    <div className="kl-picker" style={{ top }} role="dialog" aria-label="Choisir les couloirs">
      <div style={{ display: "flex", alignItems: "center" }}>
        <strong style={{ fontSize: 15 }}>Couloirs</strong>
        <span className="kl-spacer" />
        <button type="button" className="kl-btn" onClick={onClose}>Fermer</button>
      </div>
      {GROUPS.map((g) => (
        <div key={g}>
          <div className="eyebrow">{g}</div>
          {PRESETS.filter((p) => p.group === g).map((p) => (
            <label key={p.id}>
              <input type="checkbox" id={`lane-${p.id}`} checked={active.includes(p.id)} onChange={() => onToggle(p.id)} />
              <span className="swatch" style={{ background: dark ? p.colorDark : p.color }} />
              {p.label}
              <span className="count">{p.source.type === "static" ? "repères" : counts[p.id] !== undefined ? counts[p.id].toLocaleString("fr-FR") : ""}</span>
            </label>
          ))}
        </div>
      ))}
      <div>
        <div className="eyebrow">Sur mesure</div>
        <p className="kl-empty" style={{ margin: "4px 0 8px" }}>
          Un couloir personnalisé exécute ta propre requête SPARQL sur Wikidata, en direct depuis ton navigateur.
        </p>
        <button type="button" className="kl-btn primary" onClick={onNewCustom}>Nouveau couloir SPARQL</button>
      </div>
    </div>
  );
}
