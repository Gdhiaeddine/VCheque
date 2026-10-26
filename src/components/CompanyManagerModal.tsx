import React, { useState, useEffect } from "react";
import {
  Building2,
  Plus,
  Check,
  Edit2,
  Trash2,
  X,
  Briefcase,
  Hash,
  MapPin,
  Phone,
  Mail,
  AlertCircle
} from "lucide-react";
import type { CompanyRecord } from "../types";
import {
  getCompanies,
  saveCompanyRecord,
  deleteCompanyRecord,
  getActiveCompanyId,
  setActiveCompanyId
} from "../services/db";

interface CompanyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompanyChanged?: (company: CompanyRecord) => void;
}

export const CompanyManagerModal: React.FC<CompanyManagerModalProps> = ({
  isOpen,
  onClose,
  onCompanyChanged
}) => {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [activeId, setActiveId] = useState<string>(getActiveCompanyId());
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingCompany, setEditingCompany] = useState<CompanyRecord | null>(null);

  // Form states
  const [formName, setFormName] = useState<string>("");
  const [formLegalForm, setFormLegalForm] = useState<string>("SARL");
  const [formNif, setFormNif] = useState<string>("");
  const [formNis, setFormNis] = useState<string>("");
  const [formRc, setFormRc] = useState<string>("");
  const [formArticle, setFormArticle] = useState<string>("");
  const [formAddress, setFormAddress] = useState<string>("");
  const [formPhone, setFormPhone] = useState<string>("");
  const [formEmail, setFormEmail] = useState<string>("");
  const [formError, setFormError] = useState<string>("");

  const fetchCompanies = async () => {
    const list = await getCompanies();
    setCompanies(list);
    setActiveId(getActiveCompanyId());
  };

  useEffect(() => {
    if (isOpen) {
      fetchCompanies();
      setIsEditing(false);
      setEditingCompany(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectCompany = (comp: CompanyRecord) => {
    setActiveCompanyId(comp.id);
    setActiveId(comp.id);
    if (onCompanyChanged) {
      onCompanyChanged(comp);
    }
    onClose();
  };

  const handleStartCreate = () => {
    setEditingCompany(null);
    setFormName("");
    setFormLegalForm("SARL");
    setFormNif("");
    setFormNis("");
    setFormRc("");
    setFormArticle("");
    setFormAddress("");
    setFormPhone("");
    setFormEmail("");
    setFormError("");
    setIsEditing(true);
  };

  const handleStartEdit = (comp: CompanyRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCompany(comp);
    setFormName(comp.name);
    setFormLegalForm(comp.legalForm || "SARL");
    setFormNif(comp.nif || "");
    setFormNis(comp.nis || "");
    setFormRc(comp.rc || "");
    setFormArticle(comp.articleImposition || "");
    setFormAddress(comp.address || "");
    setFormPhone(comp.phone || "");
    setFormEmail(comp.email || "");
    setFormError("");
    setIsEditing(true);
  };

  const handleDelete = async (comp: CompanyRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (comp.id === "company-default") {
      alert("Impossible de supprimer le dossier d'entreprise par défaut.");
      return;
    }
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer le dossier "${comp.name}" ?\n\nAttention : tous les chèques, comptes et bénéficiaires rattachés à ce dossier seront définitivement effacés.`
    );
    if (confirmed) {
      await deleteCompanyRecord(comp.id);
      await fetchCompanies();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("Veuillez saisir la raison sociale ou le nom de l'entreprise.");
      return;
    }

    const id = editingCompany ? editingCompany.id : `company-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const record: CompanyRecord = {
      id,
      name: formName.trim(),
      legalForm: formLegalForm.trim() || undefined,
      nif: formNif.trim() || undefined,
      nis: formNis.trim() || undefined,
      rc: formRc.trim() || undefined,
      articleImposition: formArticle.trim() || undefined,
      address: formAddress.trim() || undefined,
      phone: formPhone.trim() || undefined,
      email: formEmail.trim() || undefined,
      isActive: true,
      createdAt: editingCompany ? editingCompany.createdAt : now,
      updatedAt: now
    };

    await saveCompanyRecord(record);
    await fetchCompanies();
    setIsEditing(false);

    // Si on vient de créer une nouvelle entreprise, basculer dessus
    if (!editingCompany) {
      handleSelectCompany(record);
    }
  };

  return (
    <div className="company-modal-overlay" role="dialog" aria-modal="true">
      <div className="company-modal-content">
        <div className="company-modal-header">
          <div className="company-modal-title-row">
            <div className="company-modal-icon-badge">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="company-modal-title">
                {isEditing
                  ? editingCompany
                    ? `Modifier : ${editingCompany.name}`
                    : "Créer un nouveau dossier d'entreprise"
                  : "Gestion des dossiers d'entreprises"}
              </h2>
              <p className="company-modal-subtitle">
                {isEditing
                  ? "Renseignez les coordonnées légales et fiscales de l'entreprise."
                  : "Basculez d'une société à une autre pour cloisonner vos chèques et comptes bancaires."}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="company-modal-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="company-modal-body">
          {!isEditing ? (
            <div className="company-list-wrapper">
              <div className="company-list-header-row">
                <span className="company-count-label">
                  {companies.length} dossier{companies.length > 1 ? "s" : ""} enregistré{companies.length > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  className="btn-add-company"
                  onClick={handleStartCreate}
                >
                  <Plus size={15} />
                  <span>Nouveau dossier d'entreprise</span>
                </button>
              </div>

              <div className="company-cards-grid">
                {companies.map((comp) => {
                  const isCurrent = comp.id === activeId;
                  return (
                    <div
                      key={comp.id}
                      className={`company-card ${isCurrent ? "active-company" : ""}`}
                      onClick={() => handleSelectCompany(comp)}
                    >
                      <div className="company-card-top">
                        <div className="company-card-info">
                          <div className="company-card-name-row">
                            <strong className="company-name">{comp.name}</strong>
                            {comp.legalForm && (
                              <span className="company-legal-badge">{comp.legalForm}</span>
                            )}
                            {isCurrent && (
                              <span className="company-active-pill">
                                <Check size={12} /> Actif
                              </span>
                            )}
                          </div>
                          {(comp.rc || comp.nif) && (
                            <div className="company-card-ids">
                              {comp.rc && <span>RC: {comp.rc}</span>}
                              {comp.nif && <span>NIF: {comp.nif}</span>}
                            </div>
                          )}
                          {comp.address && (
                            <div className="company-card-addr" title={comp.address}>
                              <MapPin size={12} />
                              <span>{comp.address}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="company-card-footer">
                        <span className="company-select-hint">
                          {isCurrent ? "Dossier actuellement actif" : "Cliquer pour basculer sur ce dossier"}
                        </span>
                        <div className="company-card-actions">
                          <button
                            type="button"
                            className="company-action-btn edit"
                            onClick={(e) => handleStartEdit(comp, e)}
                            title="Modifier les coordonnées de cette entreprise"
                          >
                            <Edit2 size={13} />
                          </button>
                          {comp.id !== "company-default" && (
                            <button
                              type="button"
                              className="company-action-btn delete"
                              onClick={(e) => handleDelete(comp, e)}
                              title="Supprimer ce dossier d'entreprise"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSave} className="company-form">
              {formError && (
                <div className="company-form-error">
                  <AlertCircle size={15} />
                  <span>{formError}</span>
                </div>
              )}

              <div className="form-row-grid">
                <div className="form-group-item col-8">
                  <label className="form-field-label">
                    Raison sociale ou Nom commercial <span className="req">*</span>
                  </label>
                  <div className="input-with-icon">
                    <Building2 size={15} className="field-icon" />
                    <input
                      type="text"
                      className="form-text-input"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ex: SARL Industrie & Logistique Algérie"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div className="form-group-item col-4">
                  <label className="form-field-label">Forme juridique</label>
                  <select
                    className="form-text-input form-select"
                    value={formLegalForm}
                    onChange={(e) => setFormLegalForm(e.target.value)}
                  >
                    <option value="SARL">SARL</option>
                    <option value="EURL">EURL</option>
                    <option value="SPA">SPA</option>
                    <option value="SNC">SNC</option>
                    <option value="SCS">SCS</option>
                    <option value="Entreprise Individuelle">Entreprise Individuelle</option>
                    <option value="Profession Libérale">Profession Libérale</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>
              </div>

              <div className="form-row-grid">
                <div className="form-group-item col-6">
                  <label className="form-field-label">N° Registre de Commerce (RC)</label>
                  <div className="input-with-icon">
                    <Hash size={15} className="field-icon" />
                    <input
                      type="text"
                      className="form-text-input"
                      value={formRc}
                      onChange={(e) => setFormRc(e.target.value)}
                      placeholder="Ex: 16/00-1234567B21"
                    />
                  </div>
                </div>

                <div className="form-group-item col-6">
                  <label className="form-field-label">N° Identifiant Fiscal (NIF)</label>
                  <div className="input-with-icon">
                    <Hash size={15} className="field-icon" />
                    <input
                      type="text"
                      className="form-text-input"
                      value={formNif}
                      onChange={(e) => setFormNif(e.target.value)}
                      placeholder="Ex: 001216012345678"
                    />
                  </div>
                </div>
              </div>

              <div className="form-row-grid">
                <div className="form-group-item col-6">
                  <label className="form-field-label">N° Identifiant Statistique (NIS)</label>
                  <input
                    type="text"
                    className="form-text-input"
                    value={formNis}
                    onChange={(e) => setFormNis(e.target.value)}
                    placeholder="Ex: 001216012345678"
                  />
                </div>

                <div className="form-group-item col-6">
                  <label className="form-field-label">Article d'Imposition (AI)</label>
                  <input
                    type="text"
                    className="form-text-input"
                    value={formArticle}
                    onChange={(e) => setFormArticle(e.target.value)}
                    placeholder="Ex: 16012345678"
                  />
                </div>
              </div>

              <div className="form-group-item">
                <label className="form-field-label">Adresse du siège social</label>
                <div className="input-with-icon">
                  <MapPin size={15} className="field-icon" />
                  <input
                    type="text"
                    className="form-text-input"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="Ex: Zone Industrielle Oued Smar, Lot N° 45, Alger"
                  />
                </div>
              </div>

              <div className="form-row-grid">
                <div className="form-group-item col-6">
                  <label className="form-field-label">Téléphone</label>
                  <div className="input-with-icon">
                    <Phone size={15} className="field-icon" />
                    <input
                      type="text"
                      className="form-text-input"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="Ex: 023 45 67 89 / 0550 12 34 56"
                    />
                  </div>
                </div>

                <div className="form-group-item col-6">
                  <label className="form-field-label">Adresse Email</label>
                  <div className="input-with-icon">
                    <Mail size={15} className="field-icon" />
                    <input
                      type="email"
                      className="form-text-input"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="contact@monentreprise.dz"
                    />
                  </div>
                </div>
              </div>

              <div className="company-form-actions">
                <button
                  type="button"
                  className="btn-modal-secondary"
                  onClick={() => setIsEditing(false)}
                >
                  Annuler
                </button>
                <button type="submit" className="btn-modal-primary">
                  <Check size={16} />
                  <span>{editingCompany ? "Enregistrer les modifications" : "Créer l'entreprise"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
