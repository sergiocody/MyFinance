export type Database = {
  public: {
    Functions: {
      get_bank_connection_by_account: {
        Args: { p_account_id: string };
        Returns: {
          id: string;
          user_id: string;
          account_id: string;
          institution_id: string;
          institution_name: string | null;
          authorization_id: string | null;
          session_id: string | null;
          session_expires_at: string | null;
          external_account_uid: string | null;
          status: string;
          last_synced_at: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        }[];
      };
      update_bank_connection_session: {
        Args: {
          p_connection_id: string;
          p_external_account_uid: string;
          p_session_id: string;
          p_session_expires_at: string;
          p_status: string;
          p_error_message?: string | null;
        };
        Returns: undefined;
      };
      set_bank_connection_error: {
        Args: {
          p_connection_id: string;
          p_error_message: string;
        };
        Returns: undefined;
      };
    };
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          type: "checking" | "savings" | "credit_card" | "cash" | "investment" | "other";
          currency: string;
          initial_balance: number;
          current_balance: number;
          bank_name: string | null;
          iban: string | null;
          color: string;
          is_active: boolean;
          account_class: "standard" | "remunerated" | "investment";
          account_mode: "manual" | "automated";
          parent_account_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          type: "checking" | "savings" | "credit_card" | "cash" | "investment" | "other";
          currency?: string;
          initial_balance?: number;
          current_balance?: number;
          bank_name?: string | null;
          iban?: string | null;
          color?: string;
          is_active?: boolean;
          account_class?: "standard" | "remunerated" | "investment";
          account_mode?: "manual" | "automated";
          parent_account_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          type?: "checking" | "savings" | "credit_card" | "cash" | "investment" | "other";
          currency?: string;
          initial_balance?: number;
          current_balance?: number;
          bank_name?: string | null;
          iban?: string | null;
          color?: string;
          is_active?: boolean;
          account_class?: "standard" | "remunerated" | "investment";
          account_mode?: "manual" | "automated";
          parent_account_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      bank_connections: {
        Row: {
          id: string;
          user_id: string | null;
          account_id: string;
          institution_id: string;
          institution_name: string | null;
          authorization_id: string | null;
          session_id: string | null;
          session_expires_at: string | null;
          external_account_uid: string | null;
          status: "pending" | "linked" | "expired" | "error" | "suspended";
          last_synced_at: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          account_id: string;
          institution_id: string;
          institution_name?: string | null;
          authorization_id?: string | null;
          session_id?: string | null;
          session_expires_at?: string | null;
          external_account_uid?: string | null;
          status?: "pending" | "linked" | "expired" | "error" | "suspended";
          last_synced_at?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string | null;
          account_id?: string;
          institution_id?: string;
          institution_name?: string | null;
          authorization_id?: string | null;
          session_id?: string | null;
          session_expires_at?: string | null;
          external_account_uid?: string | null;
          status?: "pending" | "linked" | "expired" | "error" | "suspended";
          last_synced_at?: string | null;
          error_message?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bank_connections_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_connections_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: true;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          }
        ];
      };
      categories: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          type: "income" | "expense" | "transfer";
          icon: string | null;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          type: "income" | "expense" | "transfer";
          icon?: string | null;
          color?: string;
          created_at?: string;
        };
        Update: {
          user_id?: string | null;
          name?: string;
          type?: "income" | "expense" | "transfer";
          icon?: string | null;
          color?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      labels: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          color?: string;
          created_at?: string;
        };
        Update: {
          user_id?: string | null;
          name?: string;
          color?: string;
        };
        Relationships: [
          {
            foreignKeyName: "labels_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string | null;
          account_id: string;
          category_id: string | null;
          type: "income" | "expense" | "transfer";
          amount: number;
          description: string | null;
          notes: string | null;
          date: string;
          transaction_hash: string | null;
          transfer_to_account_id: string | null;
          import_id: string | null;
          source: "manual" | "sync";
          external_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          account_id: string;
          category_id?: string | null;
          type: "income" | "expense" | "transfer";
          amount: number;
          description?: string | null;
          notes?: string | null;
          date: string;
          transaction_hash?: string | null;
          transfer_to_account_id?: string | null;
          import_id?: string | null;
          source?: "manual" | "sync";
          external_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string | null;
          account_id?: string;
          category_id?: string | null;
          type?: "income" | "expense" | "transfer";
          amount?: number;
          description?: string | null;
          notes?: string | null;
          date?: string;
          transaction_hash?: string | null;
          transfer_to_account_id?: string | null;
          import_id?: string | null;
          source?: "manual" | "sync";
          external_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_import_id_fkey";
            columns: ["import_id"];
            isOneToOne: false;
            referencedRelation: "imports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_transfer_to_account_id_fkey";
            columns: ["transfer_to_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          }
        ];
      };
      transaction_labels: {
        Row: {
          transaction_id: string;
          label_id: string;
        };
        Insert: {
          transaction_id: string;
          label_id: string;
        };
        Update: {
          transaction_id?: string;
          label_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_labels_label_id_fkey";
            columns: ["label_id"];
            isOneToOne: false;
            referencedRelation: "labels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_labels_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          }
        ];
      };
      imports: {
        Row: {
          id: string;
          user_id: string | null;
          filename: string;
          account_id: string | null;
          rows_imported: number;
          rows_skipped: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          filename: string;
          account_id?: string | null;
          rows_imported?: number;
          rows_skipped?: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          user_id?: string | null;
          filename?: string;
          account_id?: string | null;
          rows_imported?: number;
          rows_skipped?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "imports_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "imports_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          }
        ];
      };

    };
    Views: {
      users: {
        Row: {
          id: string | null;
        };
        Relationships: [];
      };
    };
  };
};

export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type BankConnection = Database["public"]["Tables"]["bank_connections"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Label = Database["public"]["Tables"]["labels"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type TransactionLabel = Database["public"]["Tables"]["transaction_labels"]["Row"];
export type Import = Database["public"]["Tables"]["imports"]["Row"];

export type TransactionWithRelations = Transaction & {
  categories: Category | null;
  accounts: Account;
  destination_account: Account | null;
  transaction_labels: { labels: Label }[];
};
