import { businessDetails } from "@/lib/business";

const rows = [
  ["Juridiskt företagsnamn", businessDetails.legalName],
  ["Organisationsnummer", businessDetails.organizationNumber],
  ["Adress", businessDetails.address],
  ["Telefon", businessDetails.phone],
  ["Returadress", businessDetails.returnAddress],
  ["Momsregistreringsnummer", businessDetails.vatNumber],
] as const;

export default function BusinessDetails() {
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 sm:grid-cols-[13rem_1fr]">
          <dt className="font-medium text-ink">{label}</dt>
          <dd>{value || "Uppgift saknas – måste fyllas i före lansering"}</dd>
        </div>
      ))}
      <div className="grid gap-1 sm:grid-cols-[13rem_1fr]"><dt className="font-medium text-ink">E-post</dt><dd><a href={`mailto:${businessDetails.email}`}>{businessDetails.email}</a></dd></div>
    </dl>
  );
}
