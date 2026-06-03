// 채용 공고 수집과 비교에 사용하는 공통 데이터 모델을 정의한다.
export type JobSource = "samsung" | "hyundai" | "kia" | "mobis" | "lg";

export type CompanyName =
  | "Samsung Electronics DX"
  | "Samsung Electronics DS"
  | "Hyundai Motor Company"
  | "Kia"
  | "Hyundai Mobis"
  | "LG Electronics"
  | "LG Energy Solution";

export type JobPosting = {
  id: string;
  company: CompanyName;
  title: string;
  careerType: "career";
  startDate: string | null;
  endDate: string | null;
  url: string;
  source: JobSource;
  firstSeenAt: string;
  lastSeenAt: string;
  contentHash: string;
};

export type SourceSuccess = {
  source: JobSource;
  ok: true;
  checkedAt: string;
  postingCount: number;
  preserved?: false;
};

export type SourcePreserved = {
  source: JobSource;
  ok: true;
  checkedAt: string;
  postingCount: number;
  preserved: true;
  message: string;
};

export type SourceFailure = {
  source: JobSource;
  ok: false;
  checkedAt: string;
  message: string;
};

export type SourceStatus = SourceSuccess | SourcePreserved | SourceFailure;

export type Snapshot = {
  checkedAt: string;
  postings: JobPosting[];
  sources: SourceStatus[];
};

export type ChangedPosting = {
  before: JobPosting;
  after: JobPosting;
};

export type DiffResult = {
  newPostings: JobPosting[];
  changedPostings: ChangedPosting[];
  closingSoonPostings: JobPosting[];
  removedPostings: JobPosting[];
};
