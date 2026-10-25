import React, { useState } from "react";
import { Building2, ChevronRight, Check, Search, PlusCircle } from "lucide-react";
import type { BankTemplate } from "../types";

interface BankTemplateSelectorProps {
  templates: BankTemplate[];
  selectedId: string;
  onSelectTemplate: (id: string) => void;
  onOpenManageTemplates?: () => void;
}

export const BankTemplateSelector: React.FC<BankTemplateSelectorProps> = ({
  templates,
  selectedId,
  onSelectTemplate,
  onOpenManageTemplates
}) => {
  const [filterQuery, setFilterQuery] = useState("");

  const selectedTemplate = templates.find((t) => t.id === selectedId) || templates[0];

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
    t.shortName.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="card right-panel-card bank-templates-card">
      <div className="card-header">
        <div className="header-title-group">
          <Building2 size={16} className="gold-icon" />
          <h2 className="card-title">Modèles bancaires</h2>
        </div>
        <span className="count-pill">{templates.length}</span>
      </div>

      {/* Affichage du Logo et Informations de la Banque Active */}
      {selectedTemplate && (
        <div className="active-bank-showcase-box">
          <div
            className="showcase-logo-badge"
            style={{
              borderColor: selectedTemplate.themeColor || "var(--gold-border)",
              backgroundColor: `${selectedTemplate.themeColor || "#AC8946"}15`
            }}
          >
            {selectedTemplate.logoUrl ? (
              <img src={selectedTemplate.logoUrl} alt={selectedTemplate.name} className="showcase-logo-img" />
            ) : (
              <Building2 size={24} style={{ color: selectedTemplate.themeColor || "var(--gold-primary)" }} />
            )}
          </div>
          <div className="showcase-info">
            <span className="showcase-badge-title">Banque active</span>
            <strong className="showcase-bank-name" title={selectedTemplate.name}>
              {selectedTemplate.name}
            </strong>
            <span className="showcase-bank-sub">
              Code {selectedTemplate.bankCode || "—"} · {selectedTemplate.width} × {selectedTemplate.height} mm
            </span>
          </div>
        </div>
      )}

      <div className="bank-filter-wrapper">
        <Search size={14} className="filter-search-icon" />
        <input
          type="text"
          className="bank-search-input"
          placeholder="Rechercher une banque..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
        />
      </div>

      <div className="bank-templates-list">
        {filtered.map((tpl) => {
          const isSelected = tpl.id === selectedId;

          return (
            <button
              key={tpl.id}
              type="button"
              className={`bank-item-row ${isSelected ? "selected" : ""}`}
              onClick={() => onSelectTemplate(tpl.id)}
            >
              <div
                className="bank-avatar-badge"
                style={{
                  backgroundColor: `${tpl.themeColor}18`,
                  color: tpl.themeColor,
                  borderColor: isSelected ? tpl.themeColor : "transparent"
                }}
              >
                {tpl.logoUrl ? (
                  <img src={tpl.logoUrl} alt={tpl.shortName} className="bank-logo-row-img" />
                ) : (
                  tpl.shortName.slice(0, 3)
                )}
              </div>

              <div className="bank-item-details">
                <div className="bank-item-name-row">
                  <strong className="bank-item-name">{tpl.name}</strong>
                  {isSelected && <Check size={14} className="selected-check-icon" />}
                </div>
                <div className="bank-item-meta">
                  <span>{tpl.width} × {tpl.height} mm</span>
                  <span className={`status-tag ${tpl.backgroundImage ? "status-ready" : "status-calibrate"}`}>
                    {tpl.backgroundImage ? "Scan officiel" : "À calibrer"}
                  </span>
                </div>
              </div>

              <ChevronRight size={15} className="bank-item-chevron" />
            </button>
          );
        })}
      </div>

      {onOpenManageTemplates && (
        <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)" }}>
          <button
            type="button"
            className="btn-action-card"
            style={{ width: "100%", justifyContent: "center", fontSize: "11.5px" }}
            onClick={onOpenManageTemplates}
          >
            <PlusCircle size={14} className="btn-action-icon" />
            <span>Nouveau / Gérer les modèles</span>
          </button>
        </div>
      )}
    </div>
  );
};
