import React from "react";
import { User, MapPin, Calendar, Sparkles, CheckSquare, ShieldCheck } from "lucide-react";

interface CheckFormProps {
  amount: string;
  onChangeAmount: (val: string) => void;
  beneficiary: string;
  onChangeBeneficiary: (val: string) => void;
  place: string;
  onChangePlace: (val: string) => void;
  date: string;
  onChangeDate: (val: string) => void;
  words: string;
  isCrossed: boolean;
  onChangeIsCrossed: (val: boolean) => void;
  onSubmit: () => void;
}

export const CheckForm: React.FC<CheckFormProps> = ({
  amount,
  onChangeAmount,
  beneficiary,
  onChangeBeneficiary,
  place,
  onChangePlace,
  date,
  onChangeDate,
  words,
  isCrossed,
  onChangeIsCrossed,
  onSubmit
}) => {
  const handleAmountInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits, dots and commas only
    if (/^[0-9]*[.,]?[0-9]*$/.test(raw) || raw === "") {
      onChangeAmount(raw);
    }
  };

  const formattedDisplay = () => {
    const num = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!amount.trim() || !Number.isFinite(num) || num < 0) return "—";
    return num.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DZD";
  };

  return (
    <div className="card check-form-card">
      <div className="card-header">
        <h2 className="card-title">Informations du chèque</h2>
        <span className="card-sub-info">{formattedDisplay()}</span>
      </div>

      <div className="form-body form-body-responsive">
        {/* Ligne 1 : Montant et Bénéficiaire côte-à-côte en mode large */}
        <div className="form-row-top">
          {/* Montant (DZD) */}
          <div className="form-group form-group-amount">
            <label htmlFor="amount-field" className="form-label">
              Montant (DZD)
            </label>
            <div className="input-with-addon">
              <span className="input-addon">DZD</span>
              <input
                id="amount-field"
                type="text"
                inputMode="decimal"
                className="form-input amount-field-input"
                value={amount}
                onChange={handleAmountInput}
                placeholder="125450.75"
              />
            </div>
            <small className="field-hint">Utilisez un point ou une virgule pour les centimes.</small>
          </div>

          {/* Bénéficiaire */}
          <div className="form-group form-group-beneficiary">
            <label htmlFor="beneficiary-field" className="form-label">
              Bénéficiaire
            </label>
            <div className="input-with-icon">
              <User size={16} className="input-icon" />
              <input
                id="beneficiary-field"
                type="text"
                className="form-input with-icon"
                value={beneficiary}
                onChange={(e) => onChangeBeneficiary(e.target.value)}
                placeholder="Entreprise Exemple SARL"
              />
            </div>
          </div>
        </div>

        {/* Ligne 2 : Lieu, Date et Chèque barré */}
        <div className="form-row-middle">
          <div className="form-group form-group-place">
            <label htmlFor="place-field" className="form-label">
              Lieu
            </label>
            <div className="input-with-icon">
              <MapPin size={16} className="input-icon" />
              <input
                id="place-field"
                type="text"
                className="form-input with-icon"
                value={place}
                onChange={(e) => onChangePlace(e.target.value)}
                placeholder="Alger"
              />
            </div>
          </div>

          <div className="form-group form-group-date">
            <label htmlFor="date-field" className="form-label">
              Date
            </label>
            <div className="input-with-icon">
              <Calendar size={16} className="input-icon" />
              <input
                id="date-field"
                type="date"
                className="form-input with-icon"
                value={date}
                onChange={(e) => onChangeDate(e.target.value)}
              />
            </div>
          </div>

          {/* Option Chèque barré (// Non endossable) - Même hauteur 38px et style identique à Lieu & Date */}
          <div className="form-group form-group-crossed">
            <label htmlFor="crossed-checkbox-field" className="form-label">
              Chèque barré (//)
            </label>
            <label className="crossed-input-control" htmlFor="crossed-checkbox-field">
              <input
                id="crossed-checkbox-field"
                type="checkbox"
                className="crossed-checkbox-input"
                checked={isCrossed}
                onChange={(e) => onChangeIsCrossed(e.target.checked)}
              />
              <ShieldCheck size={16} className={`crossed-icon ${isCrossed ? "active" : ""}`} />
              <span className="crossed-control-text">Non endossable</span>
              <span className={`crossed-badge ${isCrossed ? "active" : ""}`}>
                {isCrossed ? "Actif" : "Non"}
              </span>
            </label>
          </div>
        </div>

        {/* Ligne 3 : Montant en lettres */}
        <div className="form-group form-group-words">
          <label className="form-label">Montant en toutes lettres (conversion automatique certifiée)</label>
          <div className="words-card-block">
            <div className="words-card-header">
              <Sparkles size={14} className="words-icon-gold" />
              <span>Conversion automatique</span>
            </div>
            <div className="words-card-content">
              {words}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
