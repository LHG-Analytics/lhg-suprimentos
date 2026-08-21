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
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_sessions: {
        Row: {
          created_at: string | null
          id: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
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
          email_enviado_em: string | null
          fornecedor_id: string
          frete: number | null
          garantia: string | null
        }
        Insert: {
          cotacao_id: string
          email_enviado_em?: string | null
          fornecedor_id: string
          frete?: number | null
          garantia?: string | null
        }
        Update: {
          cotacao_id?: string
          email_enviado_em?: string | null
          fornecedor_id?: string
          frete?: number | null
          garantia?: string | null
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
          produto_id: string | null
          produto_nome_livre: string | null
          produto_novo: boolean
          produto_unidade_med: string | null
          quantidade: number
          selecionado_forn: string | null
        }
        Insert: {
          cotacao_id: string
          id?: string
          melhor_forn?: string | null
          produto_id?: string | null
          produto_nome_livre?: string | null
          produto_novo?: boolean
          produto_unidade_med?: string | null
          quantidade: number
          selecionado_forn?: string | null
        }
        Update: {
          cotacao_id?: string
          id?: string
          melhor_forn?: string | null
          produto_id?: string | null
          produto_nome_livre?: string | null
          produto_novo?: boolean
          produto_unidade_med?: string | null
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
          frete: number | null
          garantia: string | null
          observacao: string | null
          prazo_entrega_dias: number | null
          preco_unitario: number | null
        }
        Insert: {
          condicao_pagamento?: string | null
          cotacao_item_id: string
          cotado_em?: string | null
          fornecedor_id: string
          frete?: number | null
          garantia?: string | null
          observacao?: string | null
          prazo_entrega_dias?: number | null
          preco_unitario?: number | null
        }
        Update: {
          condicao_pagamento?: string | null
          cotacao_item_id?: string
          cotado_em?: string | null
          fornecedor_id?: string
          frete?: number | null
          garantia?: string | null
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
          deleted_at: string | null
          economia: number | null
          economia_pct: number | null
          id: string
          numero: string
          omie_codigo: string | null
          omie_sincronizado_em: string | null
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
          deleted_at?: string | null
          economia?: number | null
          economia_pct?: number | null
          id?: string
          numero: string
          omie_codigo?: string | null
          omie_sincronizado_em?: string | null
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
          deleted_at?: string | null
          economia?: number | null
          economia_pct?: number | null
          id?: string
          numero?: string
          omie_codigo?: string | null
          omie_sincronizado_em?: string | null
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
      estoque_ciclo_itens: {
        Row: {
          ciclo_id: string
          contado_em: string | null
          contado_por: string | null
          contagem_anterior: number | null
          contagem_atual: number | null
          entradas: number | null
          estoque_item_id: string
          id: string
          saidas: number | null
        }
        Insert: {
          ciclo_id: string
          contado_em?: string | null
          contado_por?: string | null
          contagem_anterior?: number | null
          contagem_atual?: number | null
          entradas?: number | null
          estoque_item_id: string
          id?: string
          saidas?: number | null
        }
        Update: {
          ciclo_id?: string
          contado_em?: string | null
          contado_por?: string | null
          contagem_anterior?: number | null
          contagem_atual?: number | null
          entradas?: number | null
          estoque_item_id?: string
          id?: string
          saidas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_ciclo_itens_ciclo_id_fkey"
            columns: ["ciclo_id"]
            isOneToOne: false
            referencedRelation: "estoque_ciclos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_ciclo_itens_contado_por_fkey"
            columns: ["contado_por"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_ciclo_itens_estoque_item_id_fkey"
            columns: ["estoque_item_id"]
            isOneToOne: false
            referencedRelation: "estoque_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_ciclos: {
        Row: {
          aberto_em: string
          aberto_por: string | null
          fechado_em: string | null
          fechado_por: string | null
          id: string
          local_id: string
          mes: string
          status: string
        }
        Insert: {
          aberto_em?: string
          aberto_por?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          local_id: string
          mes: string
          status?: string
        }
        Update: {
          aberto_em?: string
          aberto_por?: string | null
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          local_id?: string
          mes?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_ciclos_aberto_por_fkey"
            columns: ["aberto_por"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_ciclos_fechado_por_fkey"
            columns: ["fechado_por"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_ciclos_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locais_estoque"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_itens: {
        Row: {
          ativo: boolean
          automo_produto_id: number | null
          created_at: string
          estoque_ideal: number
          fator_conversao: number
          id: string
          local_id: string
          produto_id: string
        }
        Insert: {
          ativo?: boolean
          automo_produto_id?: number | null
          created_at?: string
          estoque_ideal?: number
          fator_conversao?: number
          id?: string
          local_id: string
          produto_id: string
        }
        Update: {
          ativo?: boolean
          automo_produto_id?: number | null
          created_at?: string
          estoque_ideal?: number
          fator_conversao?: number
          id?: string
          local_id?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_itens_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locais_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedor_unidade: {
        Row: {
          fornecedor_id: string
          omie_codigo: string
          omie_sincronizado_em: string | null
          unidade_id: string
        }
        Insert: {
          fornecedor_id: string
          omie_codigo: string
          omie_sincronizado_em?: string | null
          unidade_id: string
        }
        Update: {
          fornecedor_id?: string
          omie_codigo?: string
          omie_sincronizado_em?: string | null
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedor_unidade_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedor_unidade_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean
          categoria: string | null
          cep: string | null
          cidade: string | null
          cnpj: string
          competitividade_pct: number | null
          contato: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          nome_fantasia: string | null
          omie_codigo: string | null
          omie_sincronizado_em: string | null
          omie_unidade_id: string | null
          pontualidade_pct: number | null
          rating: number | null
          razao_social: string
          telefone: string | null
          uf: string | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj: string
          competitividade_pct?: number | null
          contato?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome_fantasia?: string | null
          omie_codigo?: string | null
          omie_sincronizado_em?: string | null
          omie_unidade_id?: string | null
          pontualidade_pct?: number | null
          rating?: number | null
          razao_social: string
          telefone?: string | null
          uf?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string
          competitividade_pct?: number | null
          contato?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome_fantasia?: string | null
          omie_codigo?: string | null
          omie_sincronizado_em?: string | null
          omie_unidade_id?: string | null
          pontualidade_pct?: number | null
          rating?: number | null
          razao_social?: string
          telefone?: string | null
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_omie_unidade_id_fkey"
            columns: ["omie_unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      integracao_logs: {
        Row: {
          created_at: string
          detalhe: Json | null
          duracao_ms: number | null
          entidade: string
          erros: number | null
          id: string
          novos: number | null
          operacao: string
          status: string
          total: number | null
          unidade_id: string | null
        }
        Insert: {
          created_at?: string
          detalhe?: Json | null
          duracao_ms?: number | null
          entidade: string
          erros?: number | null
          id?: string
          novos?: number | null
          operacao: string
          status: string
          total?: number | null
          unidade_id?: string | null
        }
        Update: {
          created_at?: string
          detalhe?: Json | null
          duracao_ms?: number | null
          entidade?: string
          erros?: number | null
          id?: string
          novos?: number | null
          operacao?: string
          status?: string
          total?: number | null
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integracao_logs_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      locais_estoque: {
        Row: {
          ativo: boolean
          automo_conn_key: string | null
          created_at: string
          id: string
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          automo_conn_key?: string | null
          created_at?: string
          id?: string
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          automo_conn_key?: string | null
          created_at?: string
          id?: string
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      local_unidade: {
        Row: {
          local_id: string
          unidade_id: string
        }
        Insert: {
          local_id: string
          unidade_id: string
        }
        Update: {
          local_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_unidade_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locais_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "local_unidade_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      omie_pedido_itens: {
        Row: {
          categoria: string | null
          created_at: string
          data_pedido: string | null
          descricao: string | null
          id: string
          omie_cod_prod: number | null
          omie_codigo: number | null
          omie_pedido_id: string
          quantidade: number | null
          unidade_id: string
          valor_total: number | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          data_pedido?: string | null
          descricao?: string | null
          id?: string
          omie_cod_prod?: number | null
          omie_codigo?: number | null
          omie_pedido_id: string
          quantidade?: number | null
          unidade_id: string
          valor_total?: number | null
        }
        Update: {
          categoria?: string | null
          created_at?: string
          data_pedido?: string | null
          descricao?: string | null
          id?: string
          omie_cod_prod?: number | null
          omie_codigo?: number | null
          omie_pedido_id?: string
          quantidade?: number | null
          unidade_id?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "omie_pedido_itens_omie_pedido_id_fkey"
            columns: ["omie_pedido_id"]
            isOneToOne: false
            referencedRelation: "omie_pedidos_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "omie_pedido_itens_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      omie_pedidos_compra: {
        Row: {
          created_at: string
          data_pedido: string | null
          data_previsao: string | null
          etapa: string | null
          filtro_omie: string | null
          fornecedor_codigo: number | null
          fornecedor_nome: string | null
          id: string
          itens: Json | null
          itens_sincronizados: boolean
          numero: number | null
          numero_pedido_forn: string | null
          omie_codigo: number
          omie_sincronizado_em: string
          situacao: string | null
          situacao_aprovacao: string | null
          unidade_id: string
          valor_total: number | null
        }
        Insert: {
          created_at?: string
          data_pedido?: string | null
          data_previsao?: string | null
          etapa?: string | null
          filtro_omie?: string | null
          fornecedor_codigo?: number | null
          fornecedor_nome?: string | null
          id?: string
          itens?: Json | null
          itens_sincronizados?: boolean
          numero?: number | null
          numero_pedido_forn?: string | null
          omie_codigo: number
          omie_sincronizado_em?: string
          situacao?: string | null
          situacao_aprovacao?: string | null
          unidade_id: string
          valor_total?: number | null
        }
        Update: {
          created_at?: string
          data_pedido?: string | null
          data_previsao?: string | null
          etapa?: string | null
          filtro_omie?: string | null
          fornecedor_codigo?: number | null
          fornecedor_nome?: string | null
          id?: string
          itens?: Json | null
          itens_sincronizados?: boolean
          numero?: number | null
          numero_pedido_forn?: string | null
          omie_codigo?: number
          omie_sincronizado_em?: string
          situacao?: string | null
          situacao_aprovacao?: string | null
          unidade_id?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "omie_pedidos_compra_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      omie_requisicoes: {
        Row: {
          created_at: string
          data_necessidade: string | null
          data_requisicao: string | null
          departamento: string | null
          id: string
          itens: Json | null
          numero: string | null
          observacao: string | null
          omie_codigo: number
          omie_sincronizado_em: string
          requisicao_id: string | null
          situacao: string | null
          solicitante_nome: string | null
          unidade_id: string
          valor_total: number | null
        }
        Insert: {
          created_at?: string
          data_necessidade?: string | null
          data_requisicao?: string | null
          departamento?: string | null
          id?: string
          itens?: Json | null
          numero?: string | null
          observacao?: string | null
          omie_codigo: number
          omie_sincronizado_em?: string
          requisicao_id?: string | null
          situacao?: string | null
          solicitante_nome?: string | null
          unidade_id: string
          valor_total?: number | null
        }
        Update: {
          created_at?: string
          data_necessidade?: string | null
          data_requisicao?: string | null
          departamento?: string | null
          id?: string
          itens?: Json | null
          numero?: string | null
          observacao?: string | null
          omie_codigo?: number
          omie_sincronizado_em?: string
          requisicao_id?: string | null
          situacao?: string | null
          solicitante_nome?: string | null
          unidade_id?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "omie_requisicoes_requisicao_id_fkey"
            columns: ["requisicao_id"]
            isOneToOne: false
            referencedRelation: "requisicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "omie_requisicoes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
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
          cotacao_item_id: string | null
          id: string
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          valor_total: number | null
        }
        Insert: {
          cotacao_item_id?: string | null
          id?: string
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          valor_total?: number | null
        }
        Update: {
          cotacao_item_id?: string | null
          id?: string
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_cotacao_item_id_fkey"
            columns: ["cotacao_item_id"]
            isOneToOne: false
            referencedRelation: "cotacao_itens"
            referencedColumns: ["id"]
          },
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
          frete: number | null
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
          frete?: number | null
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
          frete?: number | null
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
          cmc_updated_at: string | null
          codigo: string
          codigo_familia_omie: number | null
          created_at: string
          ean: string | null
          familia_omie: string | null
          id: string
          ncm: string | null
          nome: string
          omie_codigo: string | null
          omie_descricao: string | null
          omie_sincronizado_em: string | null
          omie_unidade_id: string | null
          preco_custo: number | null
          unidade_med: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          cmc_updated_at?: string | null
          codigo: string
          codigo_familia_omie?: number | null
          created_at?: string
          ean?: string | null
          familia_omie?: string | null
          id?: string
          ncm?: string | null
          nome: string
          omie_codigo?: string | null
          omie_descricao?: string | null
          omie_sincronizado_em?: string | null
          omie_unidade_id?: string | null
          preco_custo?: number | null
          unidade_med: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          cmc_updated_at?: string | null
          codigo?: string
          codigo_familia_omie?: number | null
          created_at?: string
          ean?: string | null
          familia_omie?: string | null
          id?: string
          ncm?: string | null
          nome?: string
          omie_codigo?: string | null
          omie_descricao?: string | null
          omie_sincronizado_em?: string | null
          omie_unidade_id?: string | null
          preco_custo?: number | null
          unidade_med?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_omie_unidade_id_fkey"
            columns: ["omie_unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
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
          produto_id: string | null
          produto_nome_livre: string | null
          produto_novo: boolean
          produto_unidade_med: string | null
          quantidade: number
          requisicao_id: string
        }
        Insert: {
          id?: string
          observacao?: string | null
          produto_id?: string | null
          produto_nome_livre?: string | null
          produto_novo?: boolean
          produto_unidade_med?: string | null
          quantidade: number
          requisicao_id: string
        }
        Update: {
          id?: string
          observacao?: string | null
          produto_id?: string | null
          produto_nome_livre?: string | null
          produto_novo?: boolean
          produto_unidade_med?: string | null
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
          omie_categoria: string | null
          omie_codigo: number | null
          omie_sincronizado_em: string | null
          omie_unidade_id: string | null
          origem: string
          solicitante_id: string | null
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
          omie_categoria?: string | null
          omie_codigo?: number | null
          omie_sincronizado_em?: string | null
          omie_unidade_id?: string | null
          origem?: string
          solicitante_id?: string | null
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
          omie_categoria?: string | null
          omie_codigo?: number | null
          omie_sincronizado_em?: string | null
          omie_unidade_id?: string | null
          origem?: string
          solicitante_id?: string | null
          status?: Database["public"]["Enums"]["req_status"]
          titulo?: string
          updated_at?: string
          urgencia?: Database["public"]["Enums"]["urgencia"]
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "requisicoes_omie_unidade_id_fkey"
            columns: ["omie_unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
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
          email_remetente: string | null
          google_sheet_id: string | null
          google_sheet_name: string
          id: string
          nome: string
          omie_app_key: string | null
          omie_app_secret: string | null
          omie_categoria_compras: string | null
          omie_cnpj: string | null
          omie_conta_corrente: number | null
          omie_empresa_id: string | null
          omie_locais_estoque: number[] | null
          slug: string
          uf: string | null
        }
        Insert: {
          ativa?: boolean
          cidade?: string | null
          cor_hex?: string | null
          created_at?: string
          email_remetente?: string | null
          google_sheet_id?: string | null
          google_sheet_name?: string
          id?: string
          nome: string
          omie_app_key?: string | null
          omie_app_secret?: string | null
          omie_categoria_compras?: string | null
          omie_cnpj?: string | null
          omie_conta_corrente?: number | null
          omie_empresa_id?: string | null
          omie_locais_estoque?: number[] | null
          slug: string
          uf?: string | null
        }
        Update: {
          ativa?: boolean
          cidade?: string | null
          cor_hex?: string | null
          created_at?: string
          email_remetente?: string | null
          google_sheet_id?: string | null
          google_sheet_name?: string
          id?: string
          nome?: string
          omie_app_key?: string | null
          omie_app_secret?: string | null
          omie_categoria_compras?: string | null
          omie_cnpj?: string | null
          omie_conta_corrente?: number | null
          omie_empresa_id?: string | null
          omie_locais_estoque?: number[] | null
          slug?: string
          uf?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          alcada_valor: number | null
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          nome: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          alcada_valor?: number | null
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          nome: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          alcada_valor?: number | null
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
      fornecedor_metricas: {
        Row: {
          competitividade_pct: number | null
          confianca: string | null
          cotacao_celulas: number | null
          entregas: number | null
          entregas_no_prazo: number | null
          fornecedor_id: string | null
          gap_medio_pct: number | null
          pontualidade_pct: number | null
          rating: number | null
          unidade_id: string | null
        }
        Relationships: []
      }
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
        | "pendente_produto"
        | "aguardando_cotacao"
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
        "pendente_produto",
        "aguardando_cotacao",
      ],
      urgencia: ["normal", "urgente"],
      user_role: ["admin", "comprador", "aprovador", "solicitante"],
    },
  },
} as const

