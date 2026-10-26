import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Paperclip,
  FileText,
  Image,
  Upload,
  Trash2,
  Eye,
  X,
  Download,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FolderOpen,
  CheckCircle2,
  Layers,
  Package,
  Scan,
  ShieldCheck,
  Tag,
  DollarSign,
  AlertCircle
} from "lucide-react";
import type { ChequeAttachmentRecord, ChequeRecord, AttachmentDocType } from "../types";
import {
  getChequeAttachments,
  saveChequeAttachment,
  deleteChequeAttachment
} from "../services/db";
import { saveExportFile } from "../services/exportReports";

interface ChequeAttachmentModalProps {
  cheque: ChequeRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onAttachmentCountChanged?: (count: number) => void;
}

const DOC_TYPE_LABELS: Record<AttachmentDocType, string> = {
  invoice: "Facture",
  purchase_order: "Bon de commande / BL",
  bank_advice: "Avis d'opéré bancaire",
  receipt: "Reçu de remise",
  other: "Autre justificatif"
};

export const ChequeAttachmentModal: React.FC<ChequeAttachmentModalProps> = ({
  cheque,
  isOpen,
  onClose,
  onAttachmentCountChanged
}) => {
  const [attachments, setAttachments] = useState<ChequeAttachmentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [previewAttachment, setPreviewAttachment] = useState<ChequeAttachmentRecord | null>(null);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState<boolean>(false);
  const [imageZoom, setImageZoom] = useState<number>(100);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [downloadToast, setDownloadToast] = useState<{ show: boolean; filename: string; path?: string } | null>(null);

  // Nouveaux états de qualification documentaire
  const [selectedDocType, setSelectedDocType] = useState<AttachmentDocType>("invoice");
  const [docReference, setDocReference] = useState<string>("");
  const [docAmount, setDocAmount] = useState<string>("");
  const [isProofOfDebit, setIsProofOfDebit] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAttachments = useCallback(async () => {
    if (!cheque) return;
    setLoading(true);
    try {
      const list = await getChequeAttachments(cheque.id);
      setAttachments(list);
      if (onAttachmentCountChanged) {
        onAttachmentCountChanged(list.length);
      }
    } catch (err) {
      console.error("Erreur chargement pièces jointes:", err);
    } finally {
      setLoading(false);
    }
  }, [cheque, onAttachmentCountChanged]);

  useEffect(() => {
    if (isOpen && cheque) {
      loadAttachments();
      setPreviewAttachment(null);
      setIsFullscreenPreview(false);
      setImageZoom(100);
    }
  }, [isOpen, cheque, loadAttachments]);

  // Écoute de la touche Échap pour fermer le plein écran
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreenPreview) {
          setIsFullscreenPreview(false);
        } else if (previewAttachment) {
          setPreviewAttachment(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreenPreview, previewAttachment]);

  if (!isOpen || !cheque) return null;

  const handleToggleProofOfDebit = async (att: ChequeAttachmentRecord) => {
    const updated: ChequeAttachmentRecord = { ...att, isProofOfDebit: !att.isProofOfDebit };
    await saveChequeAttachment(updated);
    await loadAttachments();
  };

  // Traitement d'un fichier sélectionné ou déposé
  const processFile = (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      alert("La taille maximale autorisée par pièce jointe est de 15 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataBase64 = event.target?.result as string;
      if (!dataBase64) return;

      const parsedAmount = docAmount.trim() ? parseFloat(docAmount.replace(/[^\d.,]/g, "").replace(",", ".")) : undefined;

      const newAtt: ChequeAttachmentRecord = {
        id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        chequeId: cheque.id,
        companyId: cheque.companyId,
        docType: selectedDocType,
        docReference: docReference.trim() || undefined,
        docAmount: !isNaN(parsedAmount as number) ? parsedAmount : undefined,
        isProofOfDebit: isProofOfDebit || selectedDocType === "bank_advice",
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        dataBase64,
        createdAt: new Date().toISOString()
      };

      await saveChequeAttachment(newAtt);
      await loadAttachments();
      // Réinitialise les champs optionnels
      setDocReference("");
      setDocAmount("");
      setIsProofOfDebit(false);
      // Ouvre automatiquement le dernier fichier déposé en aperçu
      setPreviewAttachment(newAtt);
      setImageZoom(100);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Réinitialise l'input pour permettre de sélectionner le même fichier si besoin
    if (e.target) {
      e.target.value = "";
    }
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // Téléchargement / Sauvegarde du fichier sur l'ordinateur
  const handleDownloadAttachment = async (att: ChequeAttachmentRecord) => {
    try {
      if (!att.dataBase64) return;

      // Décodage base64 vers Uint8Array
      const base64Clean = att.dataBase64.includes(",") ? att.dataBase64.split(",")[1] : att.dataBase64;
      const binaryStr = atob(base64Clean);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const ext = att.fileName.includes(".") ? att.fileName.split(".").pop() || "bin" : "bin";
      const result = await saveExportFile({
        defaultFilename: att.fileName,
        filterName: `Fichier ${ext.toUpperCase()}`,
        filterExt: ext,
        mimeType: att.mimeType || "application/octet-stream",
        bytes
      });

      if (result.success) {
        setDownloadToast({
          show: true,
          filename: att.fileName,
          path: result.filePath
        });
        setTimeout(() => setDownloadToast(null), 5000);
      }
    } catch (err) {
      console.error("Erreur de téléchargement de la pièce jointe:", err);
      // Fallback direct ancre de téléchargement
      try {
        if (att.dataBase64) {
          const a = document.createElement("a");
          a.href = att.dataBase64;
          a.download = att.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } catch (fallbackErr) {
        console.error("Échec du fallback de téléchargement:", fallbackErr);
      }
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Supprimer définitivement la pièce jointe "${name}" ?`)) {
      await deleteChequeAttachment(id);
      await loadAttachments();
      if (previewAttachment?.id === id) {
        setPreviewAttachment(null);
        setIsFullscreenPreview(false);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const totalBytes = attachments.reduce((sum, a) => sum + (a.fileSize || 0), 0);

  return (
    <>
      <div className="attachment-modal-overlay" role="dialog" aria-modal="true">
        <div className="attachment-modal-content">
          {/* 1. Header du dialogue */}
          <div className="attachment-modal-header">
            <div className="attachment-title-row">
              <div className="attachment-icon-badge">
                <Paperclip size={19} className="text-gold" />
              </div>
              <div>
                <h2 className="attachment-title" style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  Factures & Justificatifs numériques
                </h2>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    Bénéficiaire : <strong>{cheque.beneficiary || "Non renseigné"}</strong>
                  </span>
                  <span style={{ fontSize: "11px", background: "var(--bg-secondary)", padding: "1px 8px", borderRadius: "99px", border: "1px solid var(--border-color)", fontWeight: 600, color: "var(--gold-dark)" }}>
                    {cheque.amount} DA
                  </span>
                  {cheque.chequeNumber && (
                    <span style={{ fontSize: "11px", background: "#F1F5F9", padding: "1px 8px", borderRadius: "99px", border: "1px solid #CBD5E1", fontFamily: "var(--font-mono)", color: "#334155" }}>
                      N° {cheque.chequeNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="attachment-close-btn"
              onClick={onClose}
              title="Fermer la fenêtre"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", padding: "4px" }}
            >
              <X size={18} />
            </button>
          </div>

          {/* 2. Corps du dialogue */}
          <div className="attachment-modal-body" style={{ padding: "18px 24px", overflowY: "auto", flex: 1 }}>
            {/* Formulaire de qualification documentaire préalable */}
            <div className="attachment-meta-form" style={{ background: "var(--bg-secondary)", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--border-color)", marginBottom: "14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px", alignItems: "end" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Nature du document
                </label>
                <select
                  value={selectedDocType}
                  onChange={(e) => {
                    const dt = e.target.value as AttachmentDocType;
                    setSelectedDocType(dt);
                    if (dt === "bank_advice") setIsProofOfDebit(true);
                  }}
                  style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "#FFF", fontSize: "12px", color: "var(--text-primary)" }}
                >
                  <option value="invoice">Facture fournisseur</option>
                  <option value="purchase_order">Bon de commande / BL</option>
                  <option value="bank_advice">Avis d'opéré bancaire / Débit</option>
                  <option value="receipt">Reçu de remise</option>
                  <option value="other">Autre justificatif</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  N° de pièce / Réf (optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: FAC-2026-089"
                  value={docReference}
                  onChange={(e) => setDocReference(e.target.value)}
                  style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "#FFF", fontSize: "12px", color: "var(--text-primary)" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Montant justificatif (DA)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 50 000"
                  value={docAmount}
                  onChange={(e) => setDocAmount(e.target.value)}
                  style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "#FFF", fontSize: "12px", color: "var(--text-primary)" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingBottom: "6px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", cursor: "pointer", color: isProofOfDebit ? "var(--emerald-dark)" : "var(--text-secondary)", fontWeight: isProofOfDebit ? 700 : 500 }}>
                  <input
                    type="checkbox"
                    checked={isProofOfDebit}
                    onChange={(e) => setIsProofOfDebit(e.target.checked)}
                    style={{ accentColor: "var(--emerald-primary)", cursor: "pointer" }}
                  />
                  <span>Preuve de débit</span>
                </label>
              </div>
            </div>

            {/* Zone de glisser-déposer / Téléversement */}
            <div
              className={`attachment-dropzone ${isDragging ? "is-dragging" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "rgba(172, 137, 70, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Upload size={22} className="text-gold" />
              </div>
              <div className="dropzone-text-group">
                <strong className="dropzone-heading" style={{ fontSize: "13.5px", fontWeight: 700 }}>
                  Joindre une facture, un bon de livraison ou un scan
                </strong>
                <span className="dropzone-hint" style={{ marginTop: "2px" }}>
                  Glissez un document ici ou cliquez sur Parcourir · PDF, PNG, JPG, WEBP (jusqu'à 15 Mo)
                </span>
              </div>
              <button
                type="button"
                className="btn-action-luxury-green"
                style={{ padding: "7px 14px", fontSize: "12px", whiteSpace: "nowrap" }}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <FolderOpen size={15} />
                <span>Parcourir...</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                style={{ display: "none" }}
                onChange={handleFileInputChange}
              />
            </div>

            {/* Section des fichiers rattachés */}
            <div className="attachment-list-section" style={{ marginTop: "18px" }}>
              <div className="attachment-section-heading" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Layers size={15} style={{ color: "var(--gold-primary)" }} />
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                    Fichiers rattachés ({attachments.length})
                  </span>
                </div>
                {attachments.length > 0 && (
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Taille totale : {formatFileSize(totalBytes)}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="attachment-loading" style={{ textAlign: "center", padding: "20px", color: "var(--text-muted)", fontSize: "12.5px" }}>
                  Chargement des pièces justificatives...
                </div>
              ) : attachments.length === 0 ? (
                /* État vide soigné lorsqu'il y a 0 fichier attaché */
                <div className="attachment-empty">
                  <div className="attachment-empty-icon">
                    <FolderOpen size={24} />
                  </div>
                  <h4 className="attachment-empty-title">
                    Aucune pièce jointe liée à ce chèque pour le moment
                  </h4>
                  <p className="attachment-empty-desc">
                    Associez la facture fournisseur acquittée, le bon de commande ou la copie scannée du chèque. Vos pièces justificatives restent archivées de façon étanche et sécurisée dans votre dossier.
                  </p>
                  <div className="attachment-empty-pills">
                    <span className="attachment-empty-pill">
                      <FileText size={13} style={{ color: "var(--gold-dark)" }} />
                      <span>Facture d'achat</span>
                    </span>
                    <span className="attachment-empty-pill">
                      <Package size={13} style={{ color: "var(--gold-dark)" }} />
                      <span>Bon de livraison</span>
                    </span>
                    <span className="attachment-empty-pill">
                      <Scan size={13} style={{ color: "var(--gold-dark)" }} />
                      <span>Scan du chèque</span>
                    </span>
                    <span className="attachment-empty-pill">
                      <ShieldCheck size={13} style={{ color: "var(--gold-dark)" }} />
                      <span>Base locale SQLite</span>
                    </span>
                  </div>
                </div>
              ) : (
                /* Liste des documents existants */
                <div className="attachment-cards-grid">
                  {attachments.map((att) => {
                    const isPdf = att.mimeType.includes("pdf") || att.fileName.toLowerCase().endsWith(".pdf");
                    const isCurrentPreview = previewAttachment?.id === att.id;

                    return (
                      <div
                        key={att.id}
                        className={`attachment-card ${isCurrentPreview ? "is-active-preview" : ""}`}
                      >
                        <div
                          className="attachment-card-icon"
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "8px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: isPdf ? "#FEF2F2" : "#EFF6FF",
                            flexShrink: 0
                          }}
                        >
                          {isPdf ? (
                            <FileText size={20} style={{ color: "#DC2626" }} />
                          ) : (
                            <Image size={20} style={{ color: "#2563EB" }} />
                          )}
                        </div>

                        <div className="attachment-card-info">
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "2px" }}>
                            <strong className="attachment-filename" title={att.fileName}>
                              {att.fileName}
                            </strong>
                            <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "rgba(172, 137, 70, 0.12)", color: "var(--gold-dark)", fontWeight: 600 }}>
                              {DOC_TYPE_LABELS[att.docType || "other"]}
                            </span>
                            {att.docReference && (
                              <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "#F1F5F9", color: "#475569", fontWeight: 600 }}>
                                #{att.docReference}
                              </span>
                            )}
                            {att.docAmount && (
                              <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "#ECFDF5", color: "#065F46", fontWeight: 600 }}>
                                {att.docAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DA
                              </span>
                            )}
                            {att.isProofOfDebit && (
                              <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "#DCFCE7", color: "#166534", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "3px" }} title="Ce document certifie formellement le débit bancaire">
                                <ShieldCheck size={11} /> Preuve bancaire
                              </span>
                            )}
                          </div>
                          <span className="attachment-filesize">
                            {formatFileSize(att.fileSize)} · Ajouté le {att.createdAt.split("T")[0]}
                          </span>
                        </div>

                        <div className="attachment-card-actions">
                          {/* 0. Marquer comme preuve de débit */}
                          <button
                            type="button"
                            className={`btn-att-action ${att.isProofOfDebit ? "active" : ""}`}
                            onClick={() => handleToggleProofOfDebit(att)}
                            title={att.isProofOfDebit ? "Retirer la qualification de preuve bancaire" : "Définir comme preuve formelle de débit bancaire"}
                            style={{ color: att.isProofOfDebit ? "#166534" : "var(--text-muted)" }}
                          >
                            <ShieldCheck size={14} />
                          </button>

                          {/* 1. Télécharger / Sauvegarder */}
                          <button
                            type="button"
                            className="btn-att-action download"
                            onClick={() => handleDownloadAttachment(att)}
                            title="Télécharger / Enregistrer sur l'ordinateur"
                          >
                            <Download size={14} />
                          </button>

                          {/* 2. Prévisualiser dans la boîte */}
                          {att.dataBase64 && (
                            <button
                              type="button"
                              className={`btn-att-action preview ${isCurrentPreview ? "active" : ""}`}
                              onClick={() => {
                                setPreviewAttachment(att);
                                setImageZoom(100);
                              }}
                              title="Aperçu rapide"
                            >
                              <Eye size={14} />
                            </button>
                          )}

                          {/* 3. Agrandir / Plein écran directement */}
                          {att.dataBase64 && (
                            <button
                              type="button"
                              className="btn-att-action expand"
                              onClick={() => {
                                setPreviewAttachment(att);
                                setImageZoom(100);
                                setIsFullscreenPreview(true);
                              }}
                              title="Agrandir en plein écran"
                            >
                              <Maximize2 size={14} />
                            </button>
                          )}

                          {/* 4. Supprimer */}
                          <button
                            type="button"
                            className="btn-att-action delete"
                            onClick={() => handleDelete(att.id, att.fileName)}
                            title="Supprimer ce document"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Prévisualiseur intégré avec contrôles de zoom et bouton Agrandir */}
            {previewAttachment && previewAttachment.dataBase64 && !isFullscreenPreview && (
              <div className="attachment-preview-box">
                <div className="preview-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                    <Eye size={15} style={{ color: "var(--gold-dark)" }} />
                    <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {previewAttachment.fileName}
                    </strong>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      ({formatFileSize(previewAttachment.fileSize)})
                    </span>
                  </div>

                  <div className="preview-header-actions">
                    {/* Contrôles de zoom pour les images */}
                    {!previewAttachment.mimeType.includes("pdf") && (
                      <>
                        <button
                          type="button"
                          className="preview-tool-btn"
                          onClick={() => setImageZoom((z) => Math.max(50, z - 25))}
                          title="Zoom arrière"
                        >
                          <ZoomOut size={13} />
                        </button>
                        <span style={{ fontSize: "11px", fontVariantNumeric: "tabular-nums", minWidth: "36px", textAlign: "center" }}>
                          {imageZoom}%
                        </span>
                        <button
                          type="button"
                          className="preview-tool-btn"
                          onClick={() => setImageZoom((z) => Math.min(300, z + 25))}
                          title="Zoom avant"
                        >
                          <ZoomIn size={13} />
                        </button>
                        <button
                          type="button"
                          className="preview-tool-btn"
                          onClick={() => setImageZoom(100)}
                          title="Réinitialiser zoom (100%)"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </>
                    )}

                    {/* Bouton Agrandir / Plein écran */}
                    <button
                      type="button"
                      className="preview-tool-btn primary"
                      onClick={() => setIsFullscreenPreview(true)}
                      title="Agrandir en plein écran"
                    >
                      <Maximize2 size={13} />
                      <span>Agrandir</span>
                    </button>

                    {/* Bouton Télécharger */}
                    <button
                      type="button"
                      className="preview-tool-btn"
                      onClick={() => handleDownloadAttachment(previewAttachment)}
                      title="Télécharger ce document"
                    >
                      <Download size={13} />
                      <span>Télécharger</span>
                    </button>

                    {/* Fermer l'aperçu */}
                    <button
                      type="button"
                      className="preview-tool-btn"
                      onClick={() => setPreviewAttachment(null)}
                      title="Fermer l'aperçu"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                <div className="preview-content">
                  {previewAttachment.mimeType.includes("pdf") || previewAttachment.fileName.toLowerCase().endsWith(".pdf") ? (
                    <iframe
                      src={previewAttachment.dataBase64}
                      title={previewAttachment.fileName}
                      className="preview-iframe"
                    />
                  ) : (
                    <img
                      src={previewAttachment.dataBase64}
                      alt={previewAttachment.fileName}
                      className="preview-image"
                      style={{ transform: `scale(${imageZoom / 100})` }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. Footer du dialogue */}
          <div className="attachment-modal-footer">
            <button
              type="button"
              className="btn-action-card"
              onClick={onClose}
              style={{ padding: "8px 20px" }}
            >
              Fermer
            </button>
          </div>
        </div>
      </div>

      {/* ==========================================================================
          MODALE PLEIN ÉCRAN / APERÇU GRAND FORMAT (EXPANDED VIEWER)
          ========================================================================== */}
      {isFullscreenPreview && previewAttachment && (
        <div
          className="attachment-fullscreen-overlay"
          onClick={() => setIsFullscreenPreview(false)}
        >
          <div
            className="fullscreen-viewer-header"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fullscreen-viewer-title-group">
              <Eye size={18} style={{ color: "var(--sidebar-gold, #C5A15A)" }} />
              <div>
                <strong style={{ fontSize: "14px", display: "block" }}>
                  {previewAttachment.fileName}
                </strong>
                <span style={{ fontSize: "11px", opacity: 0.75 }}>
                  {formatFileSize(previewAttachment.fileSize)} · Chèque {cheque.beneficiary} ({cheque.amount} DA)
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* Contrôles de zoom en plein écran pour les images */}
              {!previewAttachment.mimeType.includes("pdf") && (
                <>
                  <button
                    type="button"
                    className="preview-tool-btn"
                    onClick={() => setImageZoom((z) => Math.max(50, z - 25))}
                    title="Zoom arrière"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span style={{ fontSize: "12px", minWidth: "40px", textAlign: "center", color: "#ffffff" }}>
                    {imageZoom}%
                  </span>
                  <button
                    type="button"
                    className="preview-tool-btn"
                    onClick={() => setImageZoom((z) => Math.min(350, z + 25))}
                    title="Zoom avant"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    type="button"
                    className="preview-tool-btn"
                    onClick={() => setImageZoom(100)}
                    title="Zoom 100%"
                  >
                    <RotateCcw size={13} />
                  </button>
                </>
              )}

              {/* Télécharger */}
              <button
                type="button"
                className="btn-action-luxury-green"
                style={{ padding: "6px 14px", fontSize: "12px" }}
                onClick={() => handleDownloadAttachment(previewAttachment)}
              >
                <Download size={14} />
                <span>Télécharger</span>
              </button>

              {/* Réduire / Fermer */}
              <button
                type="button"
                className="btn-action-card"
                style={{ padding: "6px 12px", fontSize: "12px" }}
                onClick={() => setIsFullscreenPreview(false)}
                title="Quitter le plein écran (Échap)"
              >
                <Minimize2 size={14} />
                <span>Réduire</span>
              </button>

              <button
                type="button"
                className="btn-modal-close"
                style={{ color: "#ffffff", padding: "4px" }}
                onClick={() => setIsFullscreenPreview(false)}
                title="Fermer (Échap)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div
            className="fullscreen-viewer-body"
            onClick={(e) => e.stopPropagation()}
          >
            {previewAttachment.mimeType.includes("pdf") || previewAttachment.fileName.toLowerCase().endsWith(".pdf") ? (
              <iframe
                src={previewAttachment.dataBase64}
                title={previewAttachment.fileName}
                className="fullscreen-iframe"
              />
            ) : (
              <img
                src={previewAttachment.dataBase64}
                alt={previewAttachment.fileName}
                className="fullscreen-image"
                style={{ transform: `scale(${imageZoom / 100})` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Toast de confirmation de téléchargement */}
      {downloadToast && downloadToast.show && (
        <div className="app-toast toast-success" role="status" style={{ zIndex: 2000 }}>
          <CheckCircle2 size={16} />
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
            <span>Document téléchargé avec succès !</span>
            <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-secondary)" }}>
              {downloadToast.path || downloadToast.filename}
            </span>
          </div>
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => setDownloadToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
};
