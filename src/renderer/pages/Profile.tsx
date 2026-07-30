import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  isSupportedCountryCode,
  normalizeCountryCode,
} from "@paperweight/analysis/country";
import {
  normalizeValue,
  validateValue,
} from "@paperweight/analysis/profile-values";
import { PROFILE_BIRTH_YEAR_MIN } from "@shared/types";
import type { ProfileBirthDate, UserProfile } from "@shared/types";
import { useAccounts } from "../hooks/useAccounts";

interface Birthday {
  day: string;
  month: string;
  year: string;
}

interface NameEntry {
  id: number;
  firstName: string;
  middleName: string;
  lastName: string;
}

interface EmailEntry {
  id: number;
  address: string;
}

interface PhoneEntry {
  id: number;
  number: string;
}

type AddressMode = "structured" | "raw";

interface AddressEntry {
  id: number;
  mode: AddressMode;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country?: string;
  raw: string;
  display: string;
  normalized: string;
}

interface NationalIdEntry {
  id: number;
  value: string;
}

type PaymentKind = "iban" | "credit_card";

interface PaymentEntry {
  id: number;
  kind: PaymentKind;
  value: string;
}

interface ProfileCollectionOverrides {
  names?: NameEntry[];
  emails?: EmailEntry[];
  phones?: PhoneEntry[];
  addresses?: AddressEntry[];
  nationalIds?: NationalIdEntry[];
  payments?: PaymentEntry[];
}

interface NameDraft {
  firstName: string;
  middleName: string;
  lastName: string;
}

interface PhoneDraft {
  number: string;
}

interface AddressDraft {
  mode: AddressMode;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  raw: string;
}

interface NationalIdDraft {
  value: string;
}

interface PaymentDraft {
  kind: PaymentKind;
  value: string;
}

interface ProfileRowProps {
  value: string;
  meta?: string;
  monospace?: boolean;
  badge?: string;
  onEdit?: () => void;
  onRemove?: () => void;
}

const EMPTY_NAME: NameDraft = {
  firstName: "",
  middleName: "",
  lastName: "",
};

const EMPTY_PHONE: PhoneDraft = {
  number: "",
};

const EMPTY_ADDRESS: AddressDraft = {
  mode: "structured",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  country: "",
  raw: "",
};

const EMPTY_NATIONAL_ID: NationalIdDraft = {
  value: "",
};

const EMPTY_PAYMENT: PaymentDraft = {
  kind: "iban",
  value: "",
};

const PAYMENT_LABELS: Record<PaymentKind, string> = {
  iban: "IBAN",
  credit_card: "Card",
};

// Above this many addresses the list gets a search box and its own scroll area.
// Below it, both would be clutter on a short list.
const EMAIL_LIST_SCROLL_AFTER = 12;

let entrySequence = 0;

function createId(): number {
  entrySequence -= 1;
  return entrySequence;
}

function compactWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function deviceCountry(): string {
  const locale = navigator.languages.find((value) => /[-_][A-Za-z]{2}$/.test(value))
    ?? navigator.language;
  return locale.match(/[-_]([A-Za-z]{2})$/)?.[1]?.toUpperCase() ?? "";
}

function boundedDatePart(
  value: string,
  min: number,
  max: number,
  digits: number,
): string | undefined {
  if (!value) return "";
  if (!/^\d+$/.test(value) || value.length > digits) return undefined;
  if (value.length < digits) return value;
  const number = Number(value);
  return number >= min && number <= max ? value : undefined;
}

function normalizeAddress(draft: AddressDraft): string {
  const value = draft.mode === "raw"
    ? draft.raw
    : [
        draft.street,
        draft.houseNumber,
        draft.postalCode,
        draft.city,
      ].join(" ");
  return normalizeValue("address", value);
}

function birthdayError(birthday: Birthday): string {
  const values = [birthday.day, birthday.month, birthday.year];
  if (values.every((value) => !value)) return "";
  if (values.some((value) => !value)) {
    return "Enter the full date or leave all three fields empty.";
  }

  const day = Number(birthday.day);
  const month = Number(birthday.month);
  const year = Number(birthday.year);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < PROFILE_BIRTH_YEAR_MIN
    || year > new Date().getUTCFullYear()
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return "Enter a valid date of birth.";
  }
  return "";
}

function ProfileRow({
  value,
  meta,
  monospace = false,
  badge,
  onEdit,
  onRemove,
}: ProfileRowProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 text-sm py-1.5 px-3 -mx-3 rounded-xl hover:bg-base-300 transition-colors">
      <div className="min-w-0 flex-1">
        <span className={`break-all ${monospace ? "font-mono" : ""}`}>
          {value}
        </span>
        {meta && (
          <span className="text-xs text-base-content/50 ml-2">{meta}</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {badge && (
          <span className="text-xs text-base-content/50 mr-1">{badge}</span>
        )}
        {onEdit && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={onEdit}
          >
            Edit
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={onRemove}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export default function Profile(): JSX.Element {
  const { accounts } = useAccounts();
  const maximumBirthYear = new Date().getUTCFullYear();
  const savingRef = useRef(false);
  const savedCountryRef = useRef<string>();
  const savedBirthDateRef = useRef<ProfileBirthDate>();
  const pendingProfileRef = useRef<UserProfile>();
  const failedProfileRef = useRef<UserProfile>();
  const [currentCountry, setCurrentCountry] = useState("");
  const [birthday, setBirthday] = useState<Birthday>({
    day: "",
    month: "",
    year: "",
  });
  const [names, setNames] = useState<NameEntry[]>([]);
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [emailFilter, setEmailFilter] = useState("");
  const [phones, setPhones] = useState<PhoneEntry[]>([]);
  const [addresses, setAddresses] = useState<AddressEntry[]>([]);
  const [nationalIds, setNationalIds] = useState<NationalIdEntry[]>([]);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);

  const [editingNameId, setEditingNameId] = useState<number>();
  const [nameDraft, setNameDraft] = useState<NameDraft>(EMPTY_NAME);
  const [nameError, setNameError] = useState("");

  const [editingEmailId, setEditingEmailId] = useState<number>();
  const [emailDraft, setEmailDraft] = useState("");
  const [emailError, setEmailError] = useState("");

  const [editingPhoneId, setEditingPhoneId] = useState<number>();
  const [phoneDraft, setPhoneDraft] = useState<PhoneDraft>(EMPTY_PHONE);
  const [phoneError, setPhoneError] = useState("");

  const [editingAddressId, setEditingAddressId] = useState<number>();
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [addressError, setAddressError] = useState("");

  const [editingNationalId, setEditingNationalId] = useState<number>();
  const [nationalIdDraft, setNationalIdDraft] =
    useState<NationalIdDraft>(EMPTY_NATIONAL_ID);
  const [nationalIdError, setNationalIdError] = useState("");

  const [editingPaymentId, setEditingPaymentId] = useState<number>();
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(EMPTY_PAYMENT);
  const [paymentError, setPaymentError] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileFieldError, setProfileFieldError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  const connectedEmails = useMemo(() => {
    const seen = new Set<string>();
    return accounts.flatMap((account) => {
      const address = normalizeValue("email", account.email);
      if (seen.has(address)) return [];
      seen.add(address);
      return [address];
    });
  }, [accounts]);

  const connectedEmailSet = useMemo(
    () => new Set(connectedEmails),
    [connectedEmails],
  );
  const editableEmails = useMemo(
    () => emails.filter(
      (entry) => !connectedEmailSet.has(normalizeValue("email", entry.address)),
    ),
    [connectedEmailSet, emails],
  );

  // A catch-all domain turns every vendor into its own alias, so this list runs
  // to hundreds of rows. Box it and let the user search rather than scrolling
  // the whole page past it. Both only appear once the list is long enough to be
  // in the way.
  const totalEmails = connectedEmails.length + editableEmails.length;
  const emailListIsLong = totalEmails > EMAIL_LIST_SCROLL_AFTER;
  const emailQuery = emailFilter.trim().toLowerCase();
  const matchesEmailQuery = (address: string): boolean =>
    emailQuery === "" || address.toLowerCase().includes(emailQuery);
  const shownConnected = connectedEmails.filter(matchesEmailQuery);
  const shownEditable = editableEmails.filter((entry) =>
    matchesEmailQuery(entry.address),
  );
  const shownEmails = shownConnected.length + shownEditable.length;

  function hydrateProfile(profile: UserProfile): void {
    const country = profile.country ?? deviceCountry();
    savedCountryRef.current = profile.country;
    savedBirthDateRef.current = profile.birthDate;
    setCurrentCountry(country);
    setBirthday(profile.birthDate
      ? {
          day: String(profile.birthDate.day),
          month: String(profile.birthDate.month),
          year: String(profile.birthDate.year),
        }
      : { day: "", month: "", year: "" });
    setNames(profile.names.map((entry) => ({
      id: entry.id,
      firstName: entry.firstName,
      middleName: entry.middleName ?? "",
      lastName: entry.lastName,
    })));
    setEmails(profile.emails);
    setPhones(profile.phones);
    setAddresses(profile.addresses.map((entry) => {
      const draft: AddressDraft = entry.mode === "raw"
        ? {
            ...EMPTY_ADDRESS,
            mode: "raw",
            raw: entry.raw ?? "",
          }
        : {
            mode: "structured",
            street: entry.street ?? "",
            houseNumber: entry.houseNumber ?? "",
            postalCode: entry.postalCode ?? "",
            city: entry.city ?? "",
            country: entry.country ?? "",
            raw: "",
          };
      return {
        id: entry.id,
        ...draft,
        ...(draft.country ? { country: draft.country } : {}),
        display: draft.mode === "raw"
          ? draft.raw
          : `${draft.street} ${draft.houseNumber}, ${draft.postalCode} ${draft.city}, ${draft.country}`,
        normalized: normalizeAddress(draft),
      };
    }));
    setNationalIds(profile.nationalIds);
    setPayments(profile.payments.map((entry) => ({
      id: entry.id,
      kind: entry.type,
      value: entry.value,
    })));
    setEditingNameId(undefined);
    setEditingEmailId(undefined);
    setEditingPhoneId(undefined);
    setEditingAddressId(undefined);
    setEditingNationalId(undefined);
    setEditingPaymentId(undefined);
    setNameDraft(EMPTY_NAME);
    setEmailDraft("");
    setPhoneDraft(EMPTY_PHONE);
    setAddressDraft({ ...EMPTY_ADDRESS, country });
    setNationalIdDraft(EMPTY_NATIONAL_ID);
    setPaymentDraft(EMPTY_PAYMENT);
    setSaved(false);
  }

  async function loadProfile(): Promise<void> {
    setLoading(true);
    setLoadError("");
    try {
      hydrateProfile(await window.api.getUserProfile());
    } catch {
      setLoadError("Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  function changed(): void {
    setSaved(false);
    setProfileFieldError("");
  }

  function clearNameDraft(): void {
    setEditingNameId(undefined);
    setNameDraft(EMPTY_NAME);
    setNameError("");
  }

  function saveName(): void {
    const firstName = compactWhitespace(nameDraft.firstName);
    const middleName = compactWhitespace(nameDraft.middleName);
    const lastName = compactWhitespace(nameDraft.lastName);
    if (!firstName || !lastName) {
      setNameError("Enter a first and last name.");
      return;
    }
    const normalized = [firstName, middleName, lastName]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    const duplicate = names.some((entry) => (
      entry.id !== editingNameId
      && [entry.firstName, entry.middleName, entry.lastName]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase() === normalized
    ));
    if (duplicate) {
      setNameError("This name is already in your profile.");
      return;
    }

    const nextNames = editingNameId
      ? names.map((entry) => entry.id === editingNameId
        ? { ...entry, firstName, middleName, lastName }
        : entry)
      : [...names, {
          id: createId(),
          firstName,
          middleName,
          lastName,
        }];
    setNames(nextNames);
    clearNameDraft();
    queueProfileSave(buildUserProfile({ names: nextNames }));
  }

  function editName(entry: NameEntry): void {
    setEditingNameId(entry.id);
    setNameDraft({
      firstName: entry.firstName,
      middleName: entry.middleName,
      lastName: entry.lastName,
    });
    setNameError("");
  }

  function clearEmailDraft(): void {
    setEditingEmailId(undefined);
    setEmailDraft("");
    setEmailError("");
  }

  function saveEmail(): void {
    const address = compactWhitespace(emailDraft);
    const normalized = normalizeValue("email", address);
    if (!validateValue("email", emailDraft)) {
      setEmailError("Enter a complete email address.");
      return;
    }
    const duplicate = (
      connectedEmailSet.has(normalized)
      || emails.some((entry) => (
        entry.id !== editingEmailId
        && normalizeValue("email", entry.address) === normalized
      ))
    );
    if (duplicate) {
      setEmailError("This email address is already in your profile.");
      return;
    }
    const nextEmails = editingEmailId
      ? emails.map((entry) => entry.id === editingEmailId
        ? { ...entry, address }
        : entry)
      : [...emails, { id: createId(), address }];
    setEmails(nextEmails);
    clearEmailDraft();
    queueProfileSave(buildUserProfile({ emails: nextEmails }));
  }

  function editEmail(entry: EmailEntry): void {
    setEditingEmailId(entry.id);
    setEmailDraft(entry.address);
    setEmailError("");
  }

  function clearPhoneDraft(): void {
    setEditingPhoneId(undefined);
    setPhoneDraft(EMPTY_PHONE);
    setPhoneError("");
  }

  function savePhone(): void {
    const number = normalizeValue("phone", phoneDraft.number);
    if (!validateValue("phone", phoneDraft.number)) {
      setPhoneError("Enter a phone number with 7 to 15 digits.");
      return;
    }
    if (phones.some((entry) => (
      entry.id !== editingPhoneId && entry.number === number
    ))) {
      setPhoneError("This phone number is already in your profile.");
      return;
    }
    const nextPhones = editingPhoneId
      ? phones.map((entry) => entry.id === editingPhoneId
        ? { ...entry, number }
        : entry)
      : [...phones, {
          id: createId(),
          number,
        }];
    setPhones(nextPhones);
    clearPhoneDraft();
    queueProfileSave(buildUserProfile({ phones: nextPhones }));
  }

  function editPhone(entry: PhoneEntry): void {
    setEditingPhoneId(entry.id);
    setPhoneDraft({ number: entry.number });
    setPhoneError("");
  }

  function clearAddressDraft(): void {
    setEditingAddressId(undefined);
    setAddressDraft({ ...EMPTY_ADDRESS, country: currentCountry });
    setAddressError("");
  }

  function saveAddress(): void {
    const country = addressDraft.mode === "structured"
      ? normalizeCountryCode(addressDraft.country)
      : "";
    if (
      addressDraft.mode === "structured"
      && !isSupportedCountryCode(country)
    ) {
      setAddressError("Add a supported two-letter country code.");
      return;
    }
    const [street, houseNumber, postalCode, city] = [
      addressDraft.street,
      addressDraft.houseNumber,
      addressDraft.postalCode,
      addressDraft.city,
    ].map(compactWhitespace);
    const raw = compactWhitespace(addressDraft.raw);
    if (
      addressDraft.mode === "structured"
      && [street, houseNumber, postalCode, city].some((value) => !value)
    ) {
      setAddressError("Enter the street, house number, postal code, and city.");
      return;
    }
    if (addressDraft.mode === "raw" && !validateValue("address", raw)) {
      setAddressError("Enter an address or postal code.");
      return;
    }

    const normalizedDraft: AddressDraft = {
      ...addressDraft,
      street,
      houseNumber,
      postalCode,
      city,
      country,
      raw,
    };
    const normalized = normalizeAddress(normalizedDraft);
    const duplicate = addresses.find((entry) => (
      entry.id !== editingAddressId && entry.normalized === normalized
    ));
    const rawUpgrade =
      addressDraft.mode === "structured" && duplicate?.mode === "raw"
        ? duplicate
        : undefined;
    if (duplicate && !rawUpgrade) {
      setAddressError("This address is already in your profile.");
      return;
    }
    const display = addressDraft.mode === "raw"
      ? raw
      : `${street} ${houseNumber}, ${postalCode} ${city}, ${country}`;
    const next: AddressEntry = {
      id: editingAddressId ?? rawUpgrade?.id ?? createId(),
      mode: addressDraft.mode,
      street,
      houseNumber,
      postalCode,
      city,
      raw,
      ...(country ? { country } : {}),
      display,
      normalized,
    };
    const nextAddresses = editingAddressId
      ? addresses
          .filter((entry) => !(
            rawUpgrade && entry.id === rawUpgrade.id
          ))
          .map((entry) => (
            entry.id === editingAddressId ? next : entry
          ))
      : rawUpgrade
        ? addresses.map((entry) => (
            entry.id === rawUpgrade.id ? next : entry
          ))
        : [...addresses, next];
    setAddresses(nextAddresses);
    clearAddressDraft();
    queueProfileSave(buildUserProfile({ addresses: nextAddresses }));
  }

  function editAddress(entry: AddressEntry): void {
    setEditingAddressId(entry.id);
    setAddressDraft({
      mode: entry.mode,
      street: entry.street,
      houseNumber: entry.houseNumber,
      postalCode: entry.postalCode,
      city: entry.city,
      country: entry.country ?? "",
      raw: entry.raw,
    });
    setAddressError("");
  }

  function clearNationalIdDraft(): void {
    setEditingNationalId(undefined);
    setNationalIdDraft(EMPTY_NATIONAL_ID);
    setNationalIdError("");
  }

  function saveNationalId(): void {
    const value = normalizeValue("national_id", nationalIdDraft.value);
    if (!validateValue("national_id", nationalIdDraft.value)) {
      setNationalIdError("Enter a national ID.");
      return;
    }
    if (nationalIds.some((entry) => (
      entry.id !== editingNationalId
      && entry.value === value
    ))) {
      setNationalIdError("This national ID is already in your profile.");
      return;
    }
    const nextNationalIds = editingNationalId
      ? nationalIds.map((entry) => (
        entry.id === editingNationalId ? { ...entry, value } : entry
      ))
      : [...nationalIds, {
          id: createId(),
          value,
        }];
    setNationalIds(nextNationalIds);
    clearNationalIdDraft();
    queueProfileSave(buildUserProfile({ nationalIds: nextNationalIds }));
  }

  function editNationalId(entry: NationalIdEntry): void {
    setEditingNationalId(entry.id);
    setNationalIdDraft({ value: entry.value });
    setNationalIdError("");
  }

  function clearPaymentDraft(): void {
    setEditingPaymentId(undefined);
    setPaymentDraft(EMPTY_PAYMENT);
    setPaymentError("");
  }

  function savePayment(): void {
    const value = normalizeValue(paymentDraft.kind, paymentDraft.value);
    if (
      paymentDraft.kind === "iban"
      && !validateValue("iban", paymentDraft.value)
    ) {
      setPaymentError("Enter a valid IBAN.");
      return;
    }
    if (
      paymentDraft.kind === "credit_card"
      && !validateValue("credit_card", paymentDraft.value)
    ) {
      setPaymentError("Enter a valid card number.");
      return;
    }
    if (payments.some((entry) => (
      entry.id !== editingPaymentId
      && entry.kind === paymentDraft.kind
      && entry.value === value
    ))) {
      setPaymentError(`This ${PAYMENT_LABELS[paymentDraft.kind]} is already in your profile.`);
      return;
    }
    const nextPayments = editingPaymentId
      ? payments.map((entry) => (
        entry.id === editingPaymentId
          ? { ...entry, kind: paymentDraft.kind, value }
          : entry
      ))
      : [...payments, {
          id: createId(),
          kind: paymentDraft.kind,
          value,
        }];
    setPayments(nextPayments);
    clearPaymentDraft();
    queueProfileSave(buildUserProfile({ payments: nextPayments }));
  }

  function editPayment(entry: PaymentEntry): void {
    setEditingPaymentId(entry.id);
    setPaymentDraft({ kind: entry.kind, value: entry.value });
    setPaymentError("");
  }

  function buildUserProfile(
    overrides: ProfileCollectionOverrides = {},
  ): UserProfile {
    const nextNames = overrides.names ?? names;
    const nextEmails = overrides.emails ?? emails;
    const nextPhones = overrides.phones ?? phones;
    const nextAddresses = overrides.addresses ?? addresses;
    const nextNationalIds = overrides.nationalIds ?? nationalIds;
    const nextPayments = overrides.payments ?? payments;
    return {
      ...(savedCountryRef.current
        ? { country: savedCountryRef.current }
        : {}),
      ...(savedBirthDateRef.current
        ? { birthDate: savedBirthDateRef.current }
        : {}),
      names: nextNames.map((entry) => ({
        id: entry.id,
        firstName: entry.firstName,
        ...(entry.middleName ? { middleName: entry.middleName } : {}),
        lastName: entry.lastName,
      })),
      emails: nextEmails,
      phones: nextPhones,
      addresses: nextAddresses.map((entry) => (
        entry.mode === "raw"
          ? {
              id: entry.id,
              mode: "raw",
              raw: entry.raw,
            }
          : {
              id: entry.id,
              mode: "structured",
              street: entry.street,
              houseNumber: entry.houseNumber,
              postalCode: entry.postalCode,
              city: entry.city,
              country: entry.country ?? "",
            }
      )),
      nationalIds: nextNationalIds,
      payments: nextPayments.map((entry) => ({
        id: entry.id,
        type: entry.kind,
        value: entry.value,
      })),
    };
  }

  async function flushProfileSaves(): Promise<void> {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    let failed = false;

    try {
      while (pendingProfileRef.current) {
        const profile = pendingProfileRef.current;
        pendingProfileRef.current = undefined;
        try {
          await window.api.saveUserProfile(profile);
        } catch {
          if (pendingProfileRef.current) continue;
          failedProfileRef.current = profile;
          setSaveError("Could not save profile. Edit the entry or try again.");
          setSaveFailed(true);
          setSaved(false);
          failed = true;
        }
      }
      if (!failed) setSaved(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function queueProfileSave(profile: UserProfile): void {
    pendingProfileRef.current = profile;
    failedProfileRef.current = undefined;
    setSaveError("");
    setSaveFailed(false);
    setSaved(false);
    void flushProfileSaves();
  }

  function retryProfileSave(): void {
    const profile = failedProfileRef.current;
    if (!profile) return;
    pendingProfileRef.current = profile;
    failedProfileRef.current = undefined;
    setSaveError("");
    setSaveFailed(false);
    void flushProfileSaves();
  }

  function saveCurrentCountry(): void {
    const country = normalizeCountryCode(currentCountry);
    if (country && !isSupportedCountryCode(country)) {
      setProfileFieldError(
        "Current location must be a supported two-letter country code.",
      );
      setSaved(false);
      return;
    }
    if (country === (savedCountryRef.current ?? "")) return;
    setProfileFieldError("");
    savedCountryRef.current = country || undefined;
    setCurrentCountry(country);
    queueProfileSave(buildUserProfile());
  }

  function saveBirthDate(): void {
    const error = birthdayError(birthday);
    if (error) {
      setProfileFieldError(error);
      setSaved(false);
      return;
    }
    const birthDate = birthday.day
      ? {
          day: Number(birthday.day),
          month: Number(birthday.month),
          year: Number(birthday.year),
        }
      : undefined;
    const previous = savedBirthDateRef.current;
    if (
      birthDate?.day === previous?.day
      && birthDate?.month === previous?.month
      && birthDate?.year === previous?.year
    ) return;
    setProfileFieldError("");
    savedBirthDateRef.current = birthDate;
    queueProfileSave(buildUserProfile());
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <span className="loading loading-spinner loading-md"></span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-2xl font-bold">User Profile</h1>
        <p role="alert" className="text-sm text-error">{loadError}</p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void loadProfile()}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold">User Profile</h1>
          <p className="text-sm text-base-content/50 mt-1">
            Add current and past personal data that belongs to you.
          </p>
        </div>
        <div className="flex items-end gap-3 shrink-0">
          <label className="flex flex-col">
            <span className="text-xs text-base-content/60 mb-1">
              Current location
            </span>
            <input
              type="text"
              maxLength={2}
              className="input input-bordered input-sm w-20 uppercase"
              placeholder="--"
              aria-label="Current location"
              value={currentCountry}
              onBlur={saveCurrentCountry}
              onChange={(event) => {
                const country = event.target.value.toUpperCase();
                setAddressDraft((current) => ({
                  ...current,
                  country: !current.country || current.country === currentCountry
                    ? country
                    : current.country,
                }));
                setCurrentCountry(country);
                changed();
              }}
            />
          </label>
        </div>
      </div>

      <div className="alert bg-base-200 border-0 items-start">
        <ShieldCheck className="w-5 h-5 mt-0.5" strokeWidth={1.5} />
        <div>
          <p className="font-medium">
            Complete your user profile to better match personal data.
          </p>
          <p className="text-sm text-base-content/60 mt-1">
            All matching happens locally. No data ever leaves this device.
          </p>
        </div>
      </div>

      {profileFieldError && (
        <p role="alert" className="text-sm text-error">{profileFieldError}</p>
      )}
      {saveError && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-sm text-error">{saveError}</p>
          {saveFailed && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={retryProfileSave}
            >
              Retry
            </button>
          )}
        </div>
      )}
      {saving && <p role="status" className="text-sm text-base-content/60">Saving...</p>}
      {!saving && saved && (
        <p role="status" className="text-sm text-success">Profile saved.</p>
      )}

      <section className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Names</h3>
          <p className="text-sm text-base-content/60">
            Add current names, former names, and initials as separate entries.
          </p>
          {names.length > 0 && (
            <div className="space-y-1">
              {names.map((entry) => {
                const display = [entry.firstName, entry.middleName, entry.lastName]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <ProfileRow
                    key={entry.id}
                    value={display}
                    onEdit={() => editName(entry)}
                    onRemove={() => {
                      const nextNames = names.filter((item) => item.id !== entry.id);
                      setNames(nextNames);
                      if (editingNameId === entry.id) clearNameDraft();
                      queueProfileSave(buildUserProfile({ names: nextNames }));
                    }}
                  />
                );
              })}
            </div>
          )}
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveName();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex flex-col">
                <span className="text-xs mb-1">First name</span>
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  value={nameDraft.firstName}
                  onChange={(event) => setNameDraft((value) => ({
                    ...value,
                    firstName: event.target.value,
                  }))}
                />
              </label>
              <label className="flex flex-col">
                <span className="text-xs mb-1">Middle name</span>
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  value={nameDraft.middleName}
                  onChange={(event) => setNameDraft((value) => ({
                    ...value,
                    middleName: event.target.value,
                  }))}
                />
              </label>
              <label className="flex flex-col">
                <span className="text-xs mb-1">Last name</span>
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  value={nameDraft.lastName}
                  onChange={(event) => setNameDraft((value) => ({
                    ...value,
                    lastName: event.target.value,
                  }))}
                />
              </label>
            </div>
            {nameError && <p className="text-sm text-error">{nameError}</p>}
            <div className="flex justify-end gap-2">
              {editingNameId && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearNameDraft}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary btn-sm">
                {editingNameId ? "Save name" : "Add name"}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Email addresses</h3>
          <p className="text-sm text-base-content/60">
            Every address and alias is a separate entry. Connected accounts are
            included automatically.
          </p>
          {emailListIsLong && (
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search..."
                className="input input-sm input-bordered w-48"
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
              />
              <span className="text-sm text-base-content/60 shrink-0">
                {emailQuery
                  ? `${shownEmails} of ${totalEmails}`
                  : `${totalEmails} ${totalEmails !== 1 ? "addresses" : "address"}`}
              </span>
            </div>
          )}
          {totalEmails > 0 && (
            <div
              className={
                emailListIsLong
                  ? "space-y-1 max-h-96 overflow-y-auto -mx-3 px-3"
                  : "space-y-1 -mx-3 px-3"
              }
            >
              {shownConnected.map((address) => (
                <ProfileRow
                  key={`connected-${address}`}
                  value={address}
                  monospace
                  badge="Connected"
                />
              ))}
              {shownEditable.map((entry) => (
                <ProfileRow
                  key={entry.id}
                  value={entry.address}
                  monospace
                  onEdit={() => editEmail(entry)}
                  onRemove={() => {
                    const nextEmails = emails.filter((item) => item.id !== entry.id);
                    setEmails(nextEmails);
                    if (editingEmailId === entry.id) clearEmailDraft();
                    queueProfileSave(buildUserProfile({ emails: nextEmails }));
                  }}
                />
              ))}
              {shownEmails === 0 && (
                <p className="text-sm text-base-content/50 py-2">
                  No address matches that search.
                </p>
              )}
            </div>
          )}
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveEmail();
            }}
          >
            <div className="flex items-end gap-3">
              <label className="flex flex-col flex-1">
                <span className="text-xs mb-1">Email address</span>
                <input
                  type="email"
                  className="input input-bordered input-sm"
                  placeholder="you@example.com"
                  value={emailDraft}
                  onChange={(event) => setEmailDraft(event.target.value)}
                />
              </label>
              {editingEmailId && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearEmailDraft}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary btn-sm">
                {editingEmailId ? "Save" : "Add"}
              </button>
            </div>
            {emailError && <p className="text-sm text-error">{emailError}</p>}
          </form>
        </div>
      </section>

      <section className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Phone numbers</h3>
          <p className="text-sm text-base-content/60">
            Enter any familiar format. Numbers are stored in one matching form.
          </p>
          {phones.length > 0 && (
            <div className="space-y-1">
              {phones.map((entry) => (
                <ProfileRow
                  key={entry.id}
                  value={entry.number}
                  monospace
                  onEdit={() => editPhone(entry)}
                  onRemove={() => {
                    const nextPhones = phones.filter((item) => item.id !== entry.id);
                    setPhones(nextPhones);
                    if (editingPhoneId === entry.id) clearPhoneDraft();
                    queueProfileSave(buildUserProfile({ phones: nextPhones }));
                  }}
                />
              ))}
            </div>
          )}
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              savePhone();
            }}
          >
            <div className="flex items-end gap-3">
              <label className="flex flex-col flex-1">
                <span className="text-xs mb-1">Phone number</span>
                <input
                  type="tel"
                  className="input input-bordered input-sm"
                  placeholder="+31 6 1234 5678"
                  value={phoneDraft.number}
                  onChange={(event) => setPhoneDraft({
                    number: event.target.value,
                  })}
                />
              </label>
              {editingPhoneId && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearPhoneDraft}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary btn-sm">
                {editingPhoneId ? "Save" : "Add"}
              </button>
            </div>
            {phoneError && <p className="text-sm text-error">{phoneError}</p>}
          </form>
        </div>
      </section>

      <section className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Addresses</h3>
          <p className="text-sm text-base-content/60">
            Add a full address, one address line, or a postal code.
          </p>
          {addresses.length > 0 && (
            <div className="space-y-1">
              {addresses.map((entry) => (
                <ProfileRow
                  key={entry.id}
                  value={entry.display}
                  meta={entry.country}
                  onEdit={() => editAddress(entry)}
                  onRemove={() => {
                    const nextAddresses = addresses.filter(
                      (item) => item.id !== entry.id,
                    );
                    setAddresses(nextAddresses);
                    if (editingAddressId === entry.id) clearAddressDraft();
                    queueProfileSave(buildUserProfile({
                      addresses: nextAddresses,
                    }));
                  }}
                />
              ))}
            </div>
          )}
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveAddress();
            }}
          >
            <div>
              <div
                role="tablist"
                aria-label="Address format"
                className="tabs tabs-box tabs-sm w-fit"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={addressDraft.mode === "structured"}
                  className={`tab ${
                    addressDraft.mode === "structured" ? "tab-active" : ""
                  }`}
                  onClick={() => setAddressDraft((value) => ({
                    ...value,
                    mode: "structured",
                  }))}
                >
                  Full address
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={addressDraft.mode === "raw"}
                  className={`tab ${
                    addressDraft.mode === "raw" ? "tab-active" : ""
                  }`}
                  onClick={() => setAddressDraft((value) => ({
                    ...value,
                    mode: "raw",
                  }))}
                >
                  Single line
                </button>
              </div>
            </div>
            {addressDraft.mode === "structured" ? (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex flex-col flex-1 min-w-0">
                    <span className="text-xs mb-1">Street</span>
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={addressDraft.street}
                      onChange={(event) => setAddressDraft((value) => ({
                        ...value,
                        street: event.target.value,
                      }))}
                    />
                  </label>
                  <label className="flex flex-col w-full sm:w-40 shrink-0">
                    <span className="text-xs mb-1">House number</span>
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={addressDraft.houseNumber}
                      onChange={(event) => setAddressDraft((value) => ({
                        ...value,
                        houseNumber: event.target.value,
                      }))}
                    />
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex flex-col w-full sm:w-40 shrink-0">
                    <span className="text-xs mb-1">Postal code</span>
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={addressDraft.postalCode}
                      onChange={(event) => setAddressDraft((value) => ({
                        ...value,
                        postalCode: event.target.value,
                      }))}
                    />
                  </label>
                  <label className="flex flex-col flex-1 min-w-0">
                    <span className="text-xs mb-1">City</span>
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={addressDraft.city}
                      onChange={(event) => setAddressDraft((value) => ({
                        ...value,
                        city: event.target.value,
                      }))}
                    />
                  </label>
                  <label className="flex flex-col w-full sm:w-24 shrink-0">
                    <span className="text-xs mb-1">Country</span>
                    <input
                      type="text"
                      maxLength={2}
                      className="input input-bordered input-sm uppercase w-full"
                      value={addressDraft.country}
                      onChange={(event) => setAddressDraft((value) => ({
                        ...value,
                        country: event.target.value.toUpperCase(),
                      }))}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <label className="flex flex-col">
                <span className="text-xs mb-1">Address or postal code</span>
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  placeholder="Keizersgracht 123, 1015 CJ Amsterdam"
                  value={addressDraft.raw}
                  onChange={(event) => setAddressDraft((value) => ({
                    ...value,
                    raw: event.target.value,
                  }))}
                />
              </label>
            )}
            <div className="flex justify-end gap-2">
              {editingAddressId && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearAddressDraft}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary btn-sm">
                {editingAddressId ? "Save" : "Add"}
              </button>
            </div>
            {addressError && <p className="text-sm text-error">{addressError}</p>}
          </form>
        </div>
      </section>

      <section className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Identity</h3>
          <p className="text-sm text-base-content/60">
            Date of birth and government identifiers.
          </p>
          <div className="space-y-3">
            <p className="text-sm font-medium">Date of birth</p>
            <div
              className="grid grid-cols-3 gap-3 max-w-md"
              onBlur={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                ) {
                  saveBirthDate();
                }
              }}
            >
              <label className="flex flex-col">
                <span className="text-xs mb-1">Day</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="input input-bordered input-sm"
                  value={birthday.day}
                  onChange={(event) => {
                    const day = boundedDatePart(
                      event.target.value,
                      1,
                      31,
                      2,
                    );
                    if (day === undefined) return;
                    setBirthday((value) => ({ ...value, day }));
                    changed();
                  }}
                />
              </label>
              <label className="flex flex-col">
                <span className="text-xs mb-1">Month</span>
                <input
                  type="number"
                  min="1"
                  max="12"
                  className="input input-bordered input-sm"
                  value={birthday.month}
                  onChange={(event) => {
                    const month = boundedDatePart(
                      event.target.value,
                      1,
                      12,
                      2,
                    );
                    if (month === undefined) return;
                    setBirthday((value) => ({ ...value, month }));
                    changed();
                  }}
                />
              </label>
              <label className="flex flex-col">
                <span className="text-xs mb-1">Year</span>
                <input
                  type="number"
                  min={PROFILE_BIRTH_YEAR_MIN}
                  max={maximumBirthYear}
                  className="input input-bordered input-sm"
                  value={birthday.year}
                  onChange={(event) => {
                    const year = boundedDatePart(
                      event.target.value,
                      PROFILE_BIRTH_YEAR_MIN,
                      maximumBirthYear,
                      4,
                    );
                    if (year === undefined) return;
                    setBirthday((value) => ({ ...value, year }));
                    changed();
                  }}
                />
              </label>
            </div>
          </div>
          {nationalIds.length > 0 && (
            <div className="space-y-1">
              {nationalIds.map((entry) => (
                <ProfileRow
                  key={entry.id}
                  value={entry.value}
                  meta="National ID"
                  monospace
                  onEdit={() => editNationalId(entry)}
                  onRemove={() => {
                    const nextNationalIds = nationalIds.filter(
                      (item) => item.id !== entry.id,
                    );
                    setNationalIds(nextNationalIds);
                    if (editingNationalId === entry.id) clearNationalIdDraft();
                    queueProfileSave(buildUserProfile({
                      nationalIds: nextNationalIds,
                    }));
                  }}
                />
              ))}
            </div>
          )}
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveNationalId();
            }}
          >
            <div className="flex items-end gap-3">
              <label className="flex flex-col flex-1">
                <span className="text-xs mb-1">National ID</span>
                <input
                  type="text"
                  className="input input-bordered input-sm font-mono"
                  value={nationalIdDraft.value}
                  onChange={(event) => setNationalIdDraft({
                    value: event.target.value,
                  })}
                />
              </label>
              {editingNationalId && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={clearNationalIdDraft}
                >
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary btn-sm">
                {editingNationalId ? "Save" : "Add"}
              </button>
            </div>
            {nationalIdError && (
              <p className="text-sm text-error">{nationalIdError}</p>
            )}
          </form>
        </div>
      </section>

      <section className="card bg-base-200">
        <div className="card-body space-y-3">
          <h3 className="font-semibold">Payments</h3>
          <p className="text-sm text-base-content/60">
            Bank accounts and payment cards.
          </p>
          {payments.length > 0 && (
            <div className="space-y-1">
              {payments.map((entry) => (
                <ProfileRow
                  key={entry.id}
                  value={entry.value}
                  meta={PAYMENT_LABELS[entry.kind]}
                  monospace
                  onEdit={() => editPayment(entry)}
                  onRemove={() => {
                    const nextPayments = payments.filter(
                      (item) => item.id !== entry.id,
                    );
                    setPayments(nextPayments);
                    if (editingPaymentId === entry.id) clearPaymentDraft();
                    queueProfileSave(buildUserProfile({
                      payments: nextPayments,
                    }));
                  }}
                />
              ))}
            </div>
          )}
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              savePayment();
            }}
          >
            <div className="grid grid-cols-[140px_minmax(0,1fr)_auto] items-end gap-3">
              <label className="flex flex-col">
                <span className="text-xs mb-1">Type</span>
                <select
                  className="select select-bordered select-sm"
                  value={paymentDraft.kind}
                  onChange={(event) => setPaymentDraft((value) => ({
                    ...value,
                    kind: event.target.value as PaymentKind,
                  }))}
                >
                  <option value="iban">IBAN</option>
                  <option value="credit_card">Card</option>
                </select>
              </label>
              <label className="flex flex-col">
                <span className="text-xs mb-1">Value</span>
                <input
                  type="text"
                  className="input input-bordered input-sm font-mono"
                  value={paymentDraft.value}
                  onChange={(event) => setPaymentDraft((value) => ({
                    ...value,
                    value: event.target.value,
                  }))}
                />
              </label>
              <div className="flex gap-2">
                {editingPaymentId && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={clearPaymentDraft}
                  >
                    Cancel
                  </button>
                )}
                <button type="submit" className="btn btn-primary btn-sm">
                  {editingPaymentId ? "Save" : "Add"}
                </button>
              </div>
            </div>
            {paymentError && <p className="text-sm text-error">{paymentError}</p>}
          </form>
        </div>
      </section>

    </div>
  );
}
