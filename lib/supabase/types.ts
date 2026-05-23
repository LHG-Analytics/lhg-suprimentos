export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          chave: string
          valor: Json
        }
        Insert: {
          chave: string
          valor: Json
        }
        Update: {
          chave?: string
          valor?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          acao: string
          created_at: string
          diff: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          diff?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          diff?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_fornecedores: {
        Row: {
          cotacao_id: string
          fornecedor_id: string
        }
        Insert: {
          cotacao_id: string
          fornecedor_id: string
        }
        Update: {
          cotacao_id?: string
          fornecedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_fornecedores_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_fornecedores_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_itens: {
        Row: {
          cotacao_id: string
          id: string
          melhor_forn: string | null
          produto_id: string
          quantidade: number
          selecionado_forn: string | null
        }
        Insert: {
          cotacao_id: string
          id?: string
          melhor_forn?: string | null
          produto_id: string
          quantidade: number
          selecionado_forn?: string | null
        }
        Update: {
          cotacao_id?: string
          id?: string
          melhor_forn?: string | null
          produto_id?: string
          quantidade?: number
          selecionado_forn?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_itens_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_itens_melhor_forn_fkey"
            columns: ["melhor_forn"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_itens_selecionado_forn_fkey"
            columns: ["selecionado_forn"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_matriz: {
        Row: {
          condicao_pagamento: string | null
          cotacao_item_id: string
          cotado_em: string | null
          fornecedor_id: string
          observacao: string | null
          prazo_entrega_dias: number | null
          preco_unitario: number | null
        }
        Insert: {
          condicao_pagamento?: string | null
          cotacao_item_id: string
          cotado_em?: string | null
          fornecedor_id: string
          observacao?: string | null
          prazo_entrega_dias?: number | null
          preco_unitario?: number | null
        }
        Update: {
          condicao_pagamento?: string | null
          cotacao_item_id?: string
          cotado_em?: string | null
          fornecedor_id?: string
          observacao?: string | null
          prazo_entrega_dias?: number | null
          preco_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_matriz_cotacao_item_id_fkey"
            columns: ["cotacao_item_id"]
            isOneToOne: false
            referencedRelation: "cotacao_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_matriz_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_unidades: {
        Row: {
          cotacao_id: string
          unidade_id: string
        }
        Insert: {
          cotacao_id: string
          unidade_id: string
        }
        Update: {
          cotacao_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_unidades_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacoes: {
        Row: {
          ai_analisada_em: string | null
          ai_resumo: string | null
          comprador_id: string | null
          created_at: string
          economia: number | null
          economia_pct: number | null
          id: string
          numero: string
          prazo: string | null
          requisicao_id: string | null
          status: Database["public"]["Enums"]["cot_status"]
          titulo: string
          urgente: boolean | null
          valor_estimado: number | null
        }
        Insert: {
          ai_analisada_em?: string | null
          ai_resumo?: string | null
          comprador_id?: string | null
          created_at?: string
          economia?: number | null
          economia_pct?: number | null
          id?: string
          numero: string
          prazo?: string | null
          requisicao_id?: string | null
          status?: Database["public"]["Enums"]["cot_status"]
          titulo: string
          urgente?: boolean | null
          valor_estimado?: number | null
        }
        Update: {
          ai_analisada_em?: string | null
          ai_resumo?: string | null
          comprador_id?: string | null
          created_at?: string
          economia?: number | null
          economia_pct?: number | null
          id?: string
          numero?: string
          prazo?: string | null
          requisicao_id?: string | null
          status?: Database["public"]["Enums"]["cot_status"]
          titulo?: string
          urgente?: boolean | null
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacoes_comprador_id_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacoes_requisicao_id_fkey"
            columns: ["requisicao_id"]
            isOneToOne: false
            referencedRelation: "requisicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      embeddings: {
        Row: {
          embedding: string | null
          entidade: string
          entidade_id: string
          id: string
          texto: string
          updated_at: string | null
        }
        Insert: {
          embedding?: string | null
          entidade: string
          entidade_id: string
          id?: string
          texto: string
          updated_at?: string | null
        }
        Update: {
          embedding?: string | null
          entidade?: string
          entidade_id?: string
          id?: string
          texto?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          ativo: boolean
          categoria: string | null
          cnpj: string
          competitividade_pct: number | null
          created_at: string
          email: string | null
          id: string
          nome_fantasia: string | null
          omie_codigo: string | null
          pontualidade_pct: number | null
          rating: number | null
          razao_social: string
          telefone: string | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          cnpj: string
          competitividade_pct?: number | null
          created_at?: string
          email?: string | null
          id?: string
          nome_fantasia?: string | null
          omie_codigo?: string | null
          pontualidade_pct?: number | null
          rating?: number | null
          razao_social: string
          telefone?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          cnpj?: string
          competitividade_pct?: number | null
          created_at?: string
          email?: string | null
          id?: string
          nome_fantasia?: string | null
          omie_codigo?: string | null
          pontualidade_pct?: number | null
          rating?: number | null
          razao_social?: string
          telefone?: string | null
        }
        Relationships: []
      }
      nf_itens: {
        Row: {
          decisao: string | null
          divergencia: Database["public"]["Enums"]["nf_item_kind"]
          id: string
          nf_id: string
          preco_nf: number | null
          preco_pedido: number | null
          produto_id: string | null
          qtd_nf: number | null
          qtd_pedido: number | null
        }
        Insert: {
          decisao?: string | null
          divergencia?: Database["public"]["Enums"]["nf_item_kind"]
          id?: string
          nf_id: string
          preco_nf?: number | null
          preco_pedido?: number | null
          produto_id?: string | null
          qtd_nf?: number | null
          qtd_pedido?: number | null
        }
        Update: {
          decisao?: string | null
          divergencia?: Database["public"]["Enums"]["nf_item_kind"]
          id?: string
          nf_id?: string
          preco_nf?: number | null
          preco_pedido?: number | null
          produto_id?: string | null
          qtd_nf?: number | null
          qtd_pedido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nf_itens_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nf_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais: {
        Row: {
          chave_acesso: string
          created_at: string
          emissao: string | null
          id: string
          lancada_em: string | null
          lancada_no_omie: boolean | null
          numero: string | null
          pedido_id: string
          serie: string | null
          status: string
          valor_total: number | null
          xml_url: string | null
        }
        Insert: {
          chave_acesso: string
          created_at?: string
          emissao?: string | null
          id?: string
          lancada_em?: string | null
          lancada_no_omie?: boolean | null
          numero?: string | null
          pedido_id: string
          serie?: string | null
          status?: string
          valor_total?: number | null
          xml_url?: string | null
        }
        Update: {
          chave_acesso?: string
          created_at?: string
          emissao?: string | null
          id?: string
          lancada_em?: string | null
          lancada_no_omie?: boolean | null
          numero?: string | null
          pedido_id?: string
          serie?: string | null
          status?: string
          valor_total?: number | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_eventos: {
        Row: {
          autor_id: string | null
          autor_nome: string | null
          created_at: string
          id: string
          metadata: Json | null
          pedido_id: string
          texto: string
          tipo: string
        }
        Insert: {
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          pedido_id: string
          texto: string
          tipo: string
        }
        Update: {
          autor_id?: string | null
          autor_nome?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          pedido_id?: string
          texto?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_eventos_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          id: string
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          valor_total: number | null
        }
        Insert: {
          id?: string
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          valor_total?: number | null
        }
        Update: {
          id?: string
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_unidades: {
        Row: {
          pedido_id: string
          unidade_id: string
        }
        Insert: {
          pedido_id: string
          unidade_id: string
        }
        Update: {
          pedido_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_unidades_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          aprovador_id: string | null
          comprador_id: string | null
          condicao_pgto: string | null
          cotacao_id: string | null
          created_at: string
          email_enviado_em: string | null
          entrega_prev: string | null
          fornecedor_id: string
          id: string
          numero: string
          omie_codigo: string | null
          omie_erro: string | null
          omie_status: Database["public"]["Enums"]["omie_status"]
          status: Database["public"]["Enums"]["ped_status"]
          valor_total: number
        }
        Insert: {
          aprovador_id?: string | null
          comprador_id?: string | null
          condicao_pgto?: string | null
          cotacao_id?: string | null
          created_at?: string
          email_enviado_em?: string | null
          entrega_prev?: string | null
          fornecedor_id: string
          id?: string
          numero: string
          omie_codigo?: string | null
          omie_erro?: string | null
          omie_status?: Database["public"]["Enums"]["omie_status"]
          status?: Database["public"]["Enums"]["ped_status"]
          valor_total: number
        }
        Update: {
          aprovador_id?: string | null
          comprador_id?: string | null
          condicao_pgto?: string | null
          cotacao_id?: string | null
          created_at?: string
          email_enviado_em?: string | null
          entrega_prev?: string | null
          fornecedor_id?: string
          id?: string
          numero?: string
          omie_codigo?: string | null
          omie_erro?: string | null
          omie_status?: Database["public"]["Enums"]["omie_status"]
          status?: Database["public"]["Enums"]["ped_status"]
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_aprovador_id_fkey"
            columns: ["aprovador_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_comprador_id_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria: string
          codigo: string
          created_at: string
          id: string
          nome: string
          unidade_med: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          codigo: string
          created_at?: string
          id?: string
          nome: string
          unidade_med: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          codigo?: string
          created_at?: string
          id?: string
          nome?: string
          unidade_med?: string
        }
        Relationships: []
      }
      regras_aprovacao: {
        Row: {
          aprovador_id: string
          ativa: boolean
          categoria: string | null
          created_at: string
          id: string
          nome: string
          unidade_id: string | null
          valor_max: number | null
          valor_min: number | null
        }
        Insert: {
          aprovador_id: string
          ativa?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nome: string
          unidade_id?: string | null
          valor_max?: number | null
          valor_min?: number | null
        }
        Update: {
          aprovador_id?: string
          ativa?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nome?: string
          unidade_id?: string | null
          valor_max?: number | null
          valor_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "regras_aprovacao_aprovador_id_fkey"
            columns: ["aprovador_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_aprovacao_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      requisicao_itens: {
        Row: {
          id: string
          observacao: string | null
          produto_id: string
          quantidade: number
          requisicao_id: string
        }
        Insert: {
          id?: string
          observacao?: string | null
          produto_id: string
          quantidade: number
          requisicao_id: string
        }
        Update: {
          id?: string
          observacao?: string | null
          produto_id?: string
          quantidade?: number
          requisicao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisicao_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisicao_itens_requisicao_id_fkey"
            columns: ["requisicao_id"]
            isOneToOne: false
            referencedRelation: "requisicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      requisicao_unidades: {
        Row: {
          requisicao_id: string
          unidade_id: string
        }
        Insert: {
          requisicao_id: string
          unidade_id: string
        }
        Update: {
          requisicao_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisicao_unidades_requisicao_id_fkey"
            columns: ["requisicao_id"]
            isOneToOne: false
            referencedRelation: "requisicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisicao_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      requisicoes: {
        Row: {
          created_at: string
          id: string
          justificativa: string | null
          numero: string
          solicitante_id: string
          status: Database["public"]["Enums"]["req_status"]
          titulo: string
          updated_at: string
          urgencia: Database["public"]["Enums"]["urgencia"]
          valor_estimado: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          justificativa?: string | null
          numero: string
          solicitante_id: string
          status?: Database["public"]["Enums"]["req_status"]
          titulo: string
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["urgencia"]
          valor_estimado?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          justificativa?: string | null
          numero?: string
          solicitante_id?: string
          status?: Database["public"]["Enums"]["req_status"]
          titulo?: string
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["urgencia"]
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "requisicoes_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          ativa: boolean
          cidade: string | null
          cor_hex: string | null
          created_at: string
          id: string
          nome: string
          omie_cnpj: string | null
          omie_empresa_id: string | null
          slug: string
          uf: string | null
        }
        Insert: {
          ativa?: boolean
          cidade?: string | null
          cor_hex?: string | null
          created_at?: string
          id?: string
          nome: string
          omie_cnpj?: string | null
          omie_empresa_id?: string | null
          slug: string
          uf?: string | null
        }
        Update: {
          ativa?: boolean
          cidade?: string | null
          cor_hex?: string | null
          created_at?: string
          id?: string
          nome?: string
          omie_cnpj?: string | null
          omie_empresa_id?: string | null
          slug?: string
          uf?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          nome: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          nome: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      user_unidades: {
        Row: {
          unidade_id: string
          user_id: string
        }
        Insert: {
          unidade_id: string
          user_id: string
        }
        Update: {
          unidade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unidades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      user_has_unidade: { Args: { p_unidade: string }; Returns: boolean }
      user_unidades_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      cot_status:
        | "rascunho"
        | "cotacao"
        | "pendente"
        | "aprovado"
        | "rejeitado"
        | "cancelado"
      nf_item_kind: "ok" | "preco" | "qtd" | "extra" | "faltante"
      omie_status: "pendente" | "sincronizado" | "erro"
      ped_status:
        | "rascunho"
        | "aguardando_aprovacao"
        | "enviado"
        | "em_transito"
        | "recebido"
        | "finalizado"
        | "cancelado"
        | "erro_omie"
      req_status:
        | "rascunho"
        | "cotacao"
        | "pendente"
        | "aprovado"
        | "rejeitado"
        | "cancelado"
      urgencia: "normal" | "urgente"
      user_role: "admin" | "comprador" | "aprovador" | "solicitante"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cot_status: [
        "rascunho",
        "cotacao",
        "pendente",
        "aprovado",
        "rejeitado",
        "cancelado",
      ],
      nf_item_kind: ["ok", "preco", "qtd", "extra", "faltante"],
      omie_status: ["pendente", "sincronizado", "erro"],
      ped_status: [
        "rascunho",
        "aguardando_aprovacao",
        "enviado",
        "em_transito",
        "recebido",
        "finalizado",
        "cancelado",
        "erro_omie",
      ],
      req_status: [
        "rascunho",
        "cotacao",
        "pendente",
        "aprovado",
        "rejeitado",
        "cancelado",
      ],
      urgencia: ["normal", "urgente"],
      user_role: ["admin", "comprador", "aprovador", "solicitante"],
    },
  },
} as const
