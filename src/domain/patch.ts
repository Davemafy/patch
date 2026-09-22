export type RepairStatus =
  | "reported"
  | "looking"
  | "waiting"
  | "options_ready"
  | "chosen";

export type RepairRequest = {
  id: string;
  description: string;
  area: string;
  photoUrl?: string;
  status: RepairStatus;
  createdAt: number;
};

export type RepairPersonCandidate = {
  id: string;
  repairId: string;
  name: string;
  website: string;
  email?: string;
  imageUrl?: string;
  serviceEvidence: string;
  sourceUrl: string;
};

export type RepairReply = {
  id: string;
  repairId: string;
  personId: string;
  rawText: string;
  canTakeJob: boolean | null;
  arrivalText: string | null;
  priceAmount: number | null;
  currency: string | null;
  note: string | null;
  receivedAt: number;
};

export type RepairOption = RepairPersonCandidate & {
  reply?: RepairReply;
  chosen: boolean;
};

export const REPAIR_STATUS_ORDER: RepairStatus[] = [
  "reported",
  "looking",
  "waiting",
  "options_ready",
  "chosen",
];
