export * from './perms';
export * from './auth';
export const FY_FORMAT_EXAMPLE = '26-27';
export const FILE_KINDS = ['photo', 'document', 'payment_proof', 'ad_creative', 'banner', 'highlight', 'trust_doc', 'logo', 'receipt_pdf', 'business_photo'] as const;
export const FILE_VISIBILITIES = ['PUBLIC', 'MEMBERS', 'PRIVATE'] as const;
