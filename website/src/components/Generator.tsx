"use client";

import {
  type CompanyOption,
  type GdprGeneratorInitialState,
  type GdprRequestAction,
} from "@shared/gdpr/types";
import { buildGdprMessage } from "@shared/gdpr/templates";
import {
  LANGUAGES,
  detectPreferredGdprLanguage,
  getPreferredDomain,
} from "@shared/gdpr/resolution";
import { Info, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

interface GeneratorProps {
  initialState?: GdprGeneratorInitialState;
  initialAction?: GdprRequestAction;
}

export function Generator({ initialState, initialAction }: GeneratorProps) {
  const [relatedBreach, setRelatedBreach] = useState<
    { slug: string; title: string } | undefined
  >(undefined);
  const [language, setLanguage] = useState(() =>
    detectPreferredGdprLanguage(
      initialState?.selectedCompany,
      initialState?.manualOrgEmail ?? "",
    ),
  );
  const [action, setAction] = useState<GdprRequestAction>(
    initialAction ?? "access",
  );
  const [companyQuery, setCompanyQuery] = useState(initialState?.companyQuery ?? "");
  const [selectedCompany, setSelectedCompany] = useState<
    CompanyOption | undefined
  >(initialState?.selectedCompany);
  const [companyResults, setCompanyResults] = useState<CompanyOption[]>([]);
  const [companyResultsForQuery, setCompanyResultsForQuery] = useState("");
  const [orgInputFocused, setOrgInputFocused] = useState(false);
  const [orgSearchStale, setOrgSearchStale] = useState(true);
  const orgBlurTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [manualOrgEmail, setManualOrgEmail] = useState(
    initialState?.manualOrgEmail ?? "",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accountReference, setAccountReference] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    const normalized = companyQuery.trim();
    if (!normalized || normalized.length < 2) {
      setCompanyResults([]);
      setCompanyResultsForQuery("");
      setOrgSearchStale(true);
      return;
    }

    setOrgSearchStale(true);
    const timeout = setTimeout(async () => {
      const q = normalized;
      try {
        const response = await fetch(
          `/api/companies?q=${encodeURIComponent(q)}&limit=5`,
        );
        const data = (await response.json()) as { companies?: CompanyOption[] };
        if (q !== companyQuery.trim()) {
          return;
        }
        const list = data.companies ?? [];
        setCompanyResults(list);
        setCompanyResultsForQuery(q);
      } catch {
        if (q !== companyQuery.trim()) {
          return;
        }
        setCompanyResults([]);
        setCompanyResultsForQuery(q);
      } finally {
        if (q === companyQuery.trim()) {
          setOrgSearchStale(false);
        }
      }
    }, 180);

    return () => clearTimeout(timeout);
  }, [companyQuery]);

  const matchedCompanyResults =
    companyResultsForQuery === companyQuery.trim() ? companyResults : [];
  const companySuggestions = matchedCompanyResults.slice(0, 5);
  const showOrgDropdown = orgInputFocused && companyQuery.trim().length >= 2;
  const showOrgSearching =
    showOrgDropdown && orgSearchStale && matchedCompanyResults.length === 0;
  const showOrgNoResults =
    showOrgDropdown && !orgSearchStale && matchedCompanyResults.length === 0;

  useEffect(() => {
    setLanguage(detectPreferredGdprLanguage(selectedCompany, manualOrgEmail));
  }, [selectedCompany, manualOrgEmail]);

  const recipientOrgEmail =
    manualOrgEmail.trim() || selectedCompany?.email?.trim() || undefined;

  const companyName = selectedCompany?.name || companyQuery;
  const selectedDomain = useMemo(
    () => getPreferredDomain(selectedCompany, manualOrgEmail),
    [manualOrgEmail, selectedCompany],
  );

  useEffect(() => {
    if (!selectedDomain) {
      setRelatedBreach(undefined);
      return;
    }

    let isCancelled = false;
    void fetch(`/api/breaches?domain=${encodeURIComponent(selectedDomain)}`)
      .then(async (response) => {
        const data = (await response.json()) as {
          breach?: { slug: string; title: string } | null;
        };
        if (!isCancelled) {
          setRelatedBreach(data.breach ?? undefined);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setRelatedBreach(undefined);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedDomain]);

  const generated = useMemo(
    () =>
      buildGdprMessage({
        language,
        action,
        companyName,
        companyEmail: recipientOrgEmail,
        companyWebform: selectedCompany?.webform,
        userName: name,
        userEmail: email,
        accountReference,
      }),
    [
      language,
      action,
      companyName,
      recipientOrgEmail,
      selectedCompany,
      name,
      email,
      accountReference,
    ],
  );

  const canReview = Boolean(
    name.trim() && email.trim() && companyName.trim() && recipientOrgEmail,
  );

  async function copyMessage() {
    await navigator.clipboard.writeText(generated.body);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1200);
  }

  return (
    <>
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5">
          <div className="card bg-base-200/50">
            <div className="card-body space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="card-title">Your request</h2>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setShowInfo(true)}
                  aria-label="Open GDPR request guidance"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>

              <div>
                <div className="grid gap-2">
                  <button
                    type="button"
                    className={`btn justify-start w-full ${action === "access" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setAction("access")}
                  >
                    Access my data
                  </button>
                  <button
                    type="button"
                    className={`btn justify-start w-full ${action === "delete" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setAction("delete")}
                  >
                    Remove my data
                  </button>
                </div>
              </div>

              <details className="collapse collapse-arrow border border-base-300 bg-base-200/30 mt-0">
                <summary className="collapse-title py-3 text-sm font-medium">
                  Follow-up guidance
                </summary>
                <div className="collapse-content text-sm space-y-3 opacity-90">
                  <div>
                    <h3 className="font-semibold text-base opacity-100 mb-2">
                      Timelines
                    </h3>
                    <p>
                      Companies have 30 days to respond, extendable to 60 days
                      for complex requests, but they must notify you if
                      extending.
                    </p>
                    <ul className="list-disc ml-5 space-y-2 mt-2">
                      <li>
                        Day 14 — send a gentle reminder if you haven&apos;t heard
                        back
                      </li>
                      <li>
                        Day 30 — follow up formally, reference the statutory
                        deadline
                      </li>
                      <li>
                        Day 60 — consider filing a complaint with your national
                        DPA if still unresolved
                      </li>
                    </ul>
                    <p className="mt-2">
                      Always try to resolve directly with the company first. If
                      you reach day 60 without a satisfactory response, you can
                      escalate to your national data protection authority. Use
                      our{" "}
                      <Link href="/resources/authorities" className="link">
                        DPA directory
                      </Link>{" "}
                      to find the right contact. Include copies of your requests
                      and any replies as evidence.
                    </p>
                  </div>
                </div>
              </details>

              <div className="space-y-2">
                <p className="text-sm font-medium">Organization *</p>
                <p className="text-xs opacity-70">
                  <Link href="/#download" className="link">Try our App</Link> to automatically detect every company that has ever emailed
                  you.
                </p>
                <div className="relative">
                  <label className="input input-bordered flex items-center gap-2 w-full">
                    <Search className="w-4 h-4 shrink-0 opacity-60" />
                    <input
                      value={companyQuery}
                      onChange={(event) => {
                        setCompanyQuery(event.target.value);
                        setSelectedCompany(undefined);
                      }}
                      onFocus={() => {
                        if (orgBlurTimeout.current) {
                          clearTimeout(orgBlurTimeout.current);
                        }
                        setOrgInputFocused(true);
                      }}
                      onBlur={() => {
                        orgBlurTimeout.current = setTimeout(() => {
                          setOrgInputFocused(false);
                        }, 150);
                      }}
                      className="grow min-w-0"
                      placeholder="Search company..."
                      autoComplete="off"
                      aria-autocomplete="list"
                      aria-expanded={showOrgDropdown}
                      aria-controls="org-suggestions"
                    />
                  </label>
                  {showOrgDropdown ? (
                    <div
                      id="org-suggestions"
                      className="absolute z-20 left-0 right-0 mt-1 rounded-box border border-base-300 bg-base-100 shadow-lg max-h-60 overflow-y-auto"
                      role="listbox"
                    >
                      {showOrgSearching ? (
                        <p className="px-3 py-3 text-sm opacity-60">
                          Searching…
                        </p>
                      ) : null}
                      {companySuggestions.length > 0 ? (
                        <ul className="py-1 bg-base-200">
                          {companySuggestions.map((company) => (
                            <li
                              key={company.slug}
                              role="presentation"
                              className="min-w-0"
                            >
                              <button
                                type="button"
                                role="option"
                                title={company.name}
                                className="btn btn-ghost btn-sm flex w-full max-w-full min-w-0 h-10 min-h-10 max-h-10 justify-start rounded-none py-0 px-3 font-normal gap-0 overflow-hidden"
                                onMouseDown={(event) =>
                                  event.preventDefault()
                                }
                                onClick={() => {
                                  setCompanyQuery(company.name);
                                  setSelectedCompany(company);
                                  if (company.email) {
                                    setManualOrgEmail(company.email);
                                  } else {
                                    setManualOrgEmail("");
                                  }
                                  setOrgInputFocused(false);
                                }}
                              >
                                <span className="min-w-0 flex-1 truncate text-left">
                                  {company.name}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {showOrgNoResults ? (
                        <p className="px-3 py-3 text-xs italic opacity-80">
                          No results. Enter the organization email below.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Organization email</p>
                <p className="text-xs opacity-70">
                  If your organization is not listed, enter its email address to
                  send your request. You can often find it in the privacy policy
                  or "contact us" section of the website.
                </p>
                <input
                  className="input input-bordered w-full"
                  type="email"
                  autoComplete="off"
                  placeholder="privacy@company.com"
                  value={manualOrgEmail}
                  onChange={(event) => setManualOrgEmail(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Language</p>
                <p className="text-xs opacity-70">
                  Suggested from the selected organization, but update if needed.
                </p>
                <select
                  className="select select-bordered w-full"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                >
                  {Object.entries(LANGUAGES).map(([code, option]) => (
                    <option key={code} value={code}>
                      {option.flag} {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs opacity-70 mt-4">* Company data sourced from <Link href='https://github.com/datenanfragen/data' className="link">Datenanfragen</Link>.</p>
            </div>
          </div>
          {relatedBreach ? (
            <Link
              href={`/breaches/${relatedBreach.slug}`}
              className="card mt-3 bg-warning/10 border border-warning/30 hover:bg-warning/15 transition-colors"
            >
              <div className="card-body p-4">
                <p className="text-xs uppercase tracking-wide opacity-70">Data breach</p>
                <p className="text-sm">
                  <span className="font-semibold">{selectedCompany?.name ?? relatedBreach.title}</span>{" "}
                  appears in our breach database. Click here for more information.
                </p>
              </div>
            </Link>
          ) : null}
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="card bg-base-200/50">
            <div className="card-body space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="card-title">Your details</h2>
                <div className="dropdown dropdown-end">
                  <button
                    type="button"
                    className="badge badge-sm badge-soft badge-primary inline-flex shrink-0 cursor-pointer items-center gap-1 border-0 font-normal"
                    aria-label="How your details are used"
                    aria-haspopup="dialog"
                  >
                    <Info className="h-3 w-3 shrink-0 opacity-80" />
                    Info
                  </button>
                  <div
                    tabIndex={0}
                    role="dialog"
                    aria-label="How your details are used"
                    className="dropdown-content mt-2 w-[min(20rem,calc(100vw-2rem))] max-h-[min(24rem,70vh)] overflow-y-auto rounded-box border border-base-300 bg-base-100 p-4 shadow-xl outline-none"
                  >
                    <p className="text-sm leading-relaxed opacity-90">
                      Your details are used to generate the email template locally
                      in your browser. Nothing you enter here is sent to our
                      servers or processed on your behalf.
                    </p>
                  </div>
                </div>
              </div>
              <input
                className="input input-bordered w-full"
                placeholder="Full name *"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <input
                className="input input-bordered w-full"
                placeholder="Email *"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <input
                className="input input-bordered w-full"
                placeholder="Customer ID / account number (recommended)"
                value={accountReference}
                onChange={(event) => setAccountReference(event.target.value)}
              />
            </div>

            <div className="divider my-0 mx-6" />

            <div className="card-body space-y-4">
              <h2 className="card-title">Email preview</h2>
              <div className="text-sm w-full">
                <p className="opacity-70">To</p>
                <p className="font-mono break-all">{generated.to}</p>
              </div>
              <div className="text-sm w-full">
                <p className="opacity-70">Subject</p>
                <p className="font-semibold">{generated.subject}</p>
              </div>
              <textarea
                className="textarea textarea-bordered min-h-[320px] w-full max-w-none"
                value={generated.body}
                readOnly
              />
              <div className="flex flex-wrap gap-2 w-full">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={copyMessage}
                  disabled={!canReview}
                >
                  {isCopied ? "Copied" : "Copy message"}
                </button>
                <a
                  href={`mailto:${encodeURIComponent(generated.to)}?subject=${encodeURIComponent(generated.subject)}&body=${encodeURIComponent(generated.body)}`}
                  className={`btn ${canReview ? "btn-soft" : "btn-disabled"}`}
                >
                  Open email client
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showInfo ? (
        <dialog className="modal modal-open">
          <div className="modal-box max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-lg">GDPR request guidance</h3>
            <div className="mt-3 space-y-4 text-sm opacity-90">
              <p>
                GDPR gives you the right to know what data companies hold about
                you and to have it deleted. These rights apply to any company
                processing your personal data in the EU or UK. Swiss residents
                have similar rights under the nFADP.
              </p>
              <div>
                <h4 className="font-semibold text-base opacity-100 mb-2">
                  Your rights
                </h4>
                <ul className="list-disc ml-5 space-y-2">
                  <li>
                    <span className="font-medium">
                      Right of access (article 15)
                    </span>
                    {" — "} A copy of all personal data a company holds about you,
                    the purpose of processing, who they&apos;ve shared it with,
                    and how long they intend to keep it.
                  </li>
                  <li>
                    <span className="font-medium">
                      Right to erasure (article 17)
                    </span>
                    {" — "}
                    Deletion of all personal data when it&apos;s no longer
                    necessary, you withdraw consent, or there&apos;s no legitimate
                    basis for keeping it. Also known as the right to be
                    forgotten.
                  </li>
                  <li>
                    <span className="font-medium">
                      Right to portability (article 20)
                    </span>
                    {" — "}
                    Your data in a structured, machine-readable format. Useful if
                    you want a copy before requesting deletion.
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-base opacity-100 mb-2">
                  Account identifier
                </h4>
                <p>
                  The optional customer ID or account number field helps the
                  company locate your data more quickly. If you have an order
                  number, account reference, or customer ID from the company,
                  adding it directly often reduces the need for further
                  verification.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-base opacity-100 mb-2">
                  Verifying your identity
                </h4>
                <p>
                  Companies may ask you to verify your identity before
                  responding. This is legitimate, but an email address and
                  account ID is usually sufficient. More thorough verification
                  may be reasonable where the data involved is sensitive, e.g.
                  financial records, medical history, or other personal records.
                  Outside of those cases, asking for a government-issued ID is
                  often disproportionate and you are not obliged to comply.
                </p>
              </div>
            </div>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => setShowInfo(false)}
              >
                Close
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setShowInfo(false)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </>
  );
}
