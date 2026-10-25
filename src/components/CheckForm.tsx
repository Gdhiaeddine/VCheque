import React, { useState, useEffect, useRef } from "react";
import { User, MapPin, Calendar, Sparkles, CheckSquare, ShieldCheck, Clock, Check } from "lucide-react";
import { searchBeneficiaries } from "../services/db";
import type { BeneficiaryRecord } from "../types";

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
  crossedWithText?: boolean;
  onChangeCrossedWithText?: (val: boolean) => void;
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
  crossedWithText = true,
  onChangeCrossedWithText,
  onSubmit
}) => {
  // Autocomplete state
  const [suggestions, setSuggestions] = useState<BeneficiaryRecord[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Recherche de suggestions lors de la saisie
  useEffect(() => {
    let isCancelled = false;
    const query = beneficiary.trim();

    const fetchSuggestions = async () => {
      try {
        const results = await searchBeneficiaries(query, 7);
        if (!isCancelled) {
          // Filtrer si c'est exactement identique à ce qui est déjà tapé
          const filtered = results.filter(
            (r) => r.name.toLowerCase() !== query.toLowerCase() || results.length > 1
          );
          setSuggestions(filtered);
          setActiveIndex(-1);
        }
      } catch (err) {
        console.warn("Erreur recherche suggestions:", err);
      }
    };

    const timer = setTimeout(fetchSuggestions, 80);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [beneficiary]);

  // Fermer la liste déroulante au clic extérieur
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectSuggestion = (record: BeneficiaryRecord) => {
    onChangeBeneficiary(record.name);
    setIsDropdownOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDownBeneficiary = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || suggestions.length === 0) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        setIsDropdownOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setIsDropdownOpen(false);
      setActiveIndex(-1);
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const q = query.trim().toLowerCase();
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.substring(0, idx)}
        <mark className="autocomplete-highlight">{text.substring(idx, idx + q.length)}</mark>
        {text.substring(idx + q.length)}
      </>
    );
  };

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

          {/* Bénéficiaire avec autocomplétion rapide */}
          <div className="form-group form-group-beneficiary relative-autocomplete-wrapper">
            <div className="label-with-hint-row">
              <label htmlFor="beneficiary-field" className="form-label">
                Bénéficiaire
              </label>
              {suggestions.length > 0 && !isDropdownOpen && (
                <span className="auto-suggestion-counter" onClick={() => setIsDropdownOpen(true)}>
                  {suggestions.length} suggestion{suggestions.length > 1 ? "s" : ""} disponible{suggestions.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="input-with-icon">
              <User size={16} className="input-icon" />
              <input
                ref={inputRef}
                id="beneficiary-field"
                type="text"
                autoComplete="off"
                className="form-input with-icon"
                value={beneficiary}
                onChange={(e) => {
                  onChangeBeneficiary(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setIsDropdownOpen(true);
                }}
                onKeyDown={handleKeyDownBeneficiary}
                placeholder="Entreprise Exemple SARL"
              />
            </div>

            {/* Menu déroulant des suggestions autocomplétées */}
            {isDropdownOpen && suggestions.length > 0 && (
              <div ref={dropdownRef} className="beneficiary-autocomplete-dropdown" role="listbox">
                <div className="autocomplete-header">
                  <span>Suggestions enregistrées</span>
                  <span className="autocomplete-tip">↑↓ pour naviguer · Entrée pour choisir</span>
                </div>
                <ul className="autocomplete-list">
                  {suggestions.map((item, index) => {
                    const isSelected = index === activeIndex;
                    return (
                      <li
                        key={item.id}
                        role="option"
                        aria-selected={isSelected}
                        className={`autocomplete-item ${isSelected ? "selected" : ""}`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => handleSelectSuggestion(item)}
                      >
                        <div className="item-name-block">
                          <span className="item-name">
                            {highlightMatch(item.name, beneficiary)}
                          </span>
                          {item.nickname && (
                            <span className="item-nickname">({item.nickname})</span>
                          )}
                        </div>

                        <div className="item-meta">
                          {item.usageCount > 0 && (
                            <span className="item-usage-tag" title="Fréquence d'utilisation">
                              {item.usageCount} chèque{item.usageCount > 1 ? "s" : ""}
                            </span>
                          )}
                          {isSelected && <Check size={14} className="item-check-icon" />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
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

          {/* Option Chèque barré (//) avec choix de la mention Non endossable */}
          <div className="form-group form-group-crossed">
            <label htmlFor="crossed-checkbox-field" className="form-label">
              Chèque barré (//)
            </label>
            <div className="crossed-control-container">
              <label className="crossed-input-control" htmlFor="crossed-checkbox-field">
                <input
                  id="crossed-checkbox-field"
                  type="checkbox"
                  className="crossed-checkbox-input"
                  checked={isCrossed}
                  onChange={(e) => onChangeIsCrossed(e.target.checked)}
                />
                <ShieldCheck size={16} className={`crossed-icon ${isCrossed ? "active" : ""}`} />
                <span className="crossed-control-text">
                  {isCrossed
                    ? (crossedWithText ? "Barres + Non endossable" : "Barres seules (//)")
                    : "Non barré"}
                </span>
                <span className={`crossed-badge ${isCrossed ? "active" : ""}`}>
                  {isCrossed ? "Actif" : "Non"}
                </span>
              </label>

              {isCrossed && onChangeCrossedWithText && (
                <div className="crossed-suboptions-row">
                  <label className="crossed-subtoggle-label" title="Imprimer ou non la mention 'NON ENDOSSABLE' entre les deux barres">
                    <input
                      type="checkbox"
                      className="crossed-subcheckbox"
                      checked={crossedWithText}
                      onChange={(e) => onChangeCrossedWithText(e.target.checked)}
                    />
                    <span>Mention « Non endossable »</span>
                  </label>
                </div>
              )}
            </div>
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
