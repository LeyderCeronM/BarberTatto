// API pública (sin UI, para que el composition root no cree ciclos). La UI vive en './ui'.
export { ReviewService, type ReviewDeps, type PublicReview, type SubmitReviewInput } from './reviewService';
export type { Review, RatingSummary } from './domain';
