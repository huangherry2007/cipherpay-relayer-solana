// Generated types for CipherpayAnchor program
// This is a placeholder - in production, this would be generated from the Anchor IDL

export interface CipherpayAnchor {
  // Placeholder interface - replace with actual generated types
  addEventListener: (event: string, callback: (data: any) => void) => void;
  // Add other program methods as needed
}

export interface DepositCompleted {
  commitment: string;
  amount: string;
  // Add other fields as needed
}

export interface TransferCompleted {
  nullifier: string;
  // Add other fields as needed
}

export interface WithdrawCompleted {
  nullifier: string;
  // Add other fields as needed
}
