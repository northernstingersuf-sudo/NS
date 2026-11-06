/** Public trader details must be completed by the owner before launch. */
export const businessDetails = {
  brand: "Northern Stingers",
  legalName: process.env.BUSINESS_LEGAL_NAME?.trim() || null,
  organizationNumber: process.env.BUSINESS_ORG_NUMBER?.trim() || null,
  address: process.env.BUSINESS_ADDRESS?.trim() || null,
  phone: process.env.BUSINESS_PHONE?.trim() || null,
  returnAddress: process.env.BUSINESS_RETURN_ADDRESS?.trim() || null,
  vatNumber: process.env.BUSINESS_VAT_NUMBER?.trim() || null,
  email: process.env.BUSINESS_EMAIL?.trim() || "info@northernstingers.store",
};

export const missingBusinessDetails = [
  ["Juridiskt företagsnamn", businessDetails.legalName],
  ["Organisationsnummer", businessDetails.organizationNumber],
  ["Postadress/gatuadress", businessDetails.address],
  ["Telefonnummer", businessDetails.phone],
] as const;

export const businessDetailsComplete = missingBusinessDetails.every(([, value]) => Boolean(value));
