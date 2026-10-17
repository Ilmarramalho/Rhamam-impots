import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Vendas() {
  const [codigoBarras, setCodigoBarras] = useState('');
  const [carrinho, setCarrinho] = useState([]);
  const [clienteNome, setClienteNome] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const barcodeInputRef = useRef(null);

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, [carrinho]);

  const buscarProdutoPorCodigo = async (e) => {
    if (e.key === 'Enter' && codigoBarras.trim() !== '') {
      e.preventDefault();
      
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .eq('codigo_barras', codigoBarras.trim())
        .single();

      if (error || !data) {
        alert('Produto não encontrado!');
      } else if (data.qtd_estoque <= 0) {
        alert(`O produto ${data.nome} está sem estoque!`);
      } else {
        adicionarAoCarrinho(data);
      }
      setCodigoBarras('');
    }
  };

  const adicionarAoCarrinho = (produto) => {
    setCarrinho((prev) => {
      const existente = prev.find((item) => item.id === produto.id);
      if (existente) {
        return prev.map((item) =>
          item.id === produto.id
            ? { ...item, quantidade: item.quantidade + 1 }
            : item
        );
      }
      return [...prev, { ...produto, quantidade: 1 }];
    });
  };

  const calcularTotal = () => {
    return carrinho.reduce((acc, item) => acc + item.preco_venda * item.quantidade, 0);
  };

  const finalizarVenda = async () => {
    if (carrinho.length === 0) return alert('O carrinho está vazio!');

    const valorTotal = calcularTotal();

    const { data: venda, error: erroVenda } = await supabase
      .from('vendas')
      .insert([
        {
          cliente_nome: clienteNome || 'Cliente Balcão',
          valor_total: valorTotal,
          forma_pagamento: formaPagamento,
          status: 'CONCLUIDA'
        }
      ])
      .select()
      .single();

    if (erroVenda) return alert('Erro ao registrar venda: ' + erroVenda.message);

    for (const item of carrinho) {
      await supabase.from('itens_venda').insert([
        {
          venda_id: venda.id,
          produto_id: item.id,
          quantidade: item.quantidade,
          preco_unitario: item.preco_venda
        }
      ]);

      await supabase
        .from('produtos')
        .update({ qtd_estoque: item.qtd_estoque - item.quantidade })
        .eq('id', item.id);

      await supabase.from('movimentacoes_estoque').insert([
        {
          produto_id: item.id,
          tipo: 'SAIDA_VENDA',
          quantidade: item.quantidade,
          origem_id: venda.id
        }
      ]);
    }

    await supabase.from('lancamentos_financeiros').insert([
      {
        tipo: 'RECEITA',
        origem: 'VENDA',
        referencia_id: venda.id,
        descricao: `Venda - ${clienteNome || 'Balcão'}`,
        valor: valorTotal,
        data_vencimento: new Date().toISOString().split('T')[0],
        data_pagamento: new Date().toISOString().split('T')[0],
        status: 'PAGO'
      }
    ]);

    alert('Venda realizada com sucesso!');
    setCarrinho([]);
    setClienteNome('');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Rhamam Imports - PDV / Vendas</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <label><b>Bipar Código de Barras: </b></label>
        <input
          ref={barcodeInputRef}
          type="text"
          value={codigoBarras}
          onChange={(e) => setCodigoBarras(e.target.value)}
          onKeyDown={buscarProdutoPorCodigo}
          placeholder="Passe o leitor aqui..."
          style={{ padding: '10px', width: '300px' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 2, border: '1px solid #ccc', padding: '15px' }}>
          <h3>Itens do Pedido</h3>
          {carrinho.length === 0 ? (
            <p>Nenhum produto adicionado.</p>
          ) : (
            <table width="100%" cellPadding="8">
              <thead>
                <tr align="left">
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Preço Unit.</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {carrinho.map((item) => (
                  <tr key={item.id}>
                    <td>{item.nome}</td>
                    <td>{item.quantidade}</td>
                    <td>R$ {item.preco_venda.toFixed(2)}</td>
                    <td>R$ {(item.preco_venda * item.quantidade).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ flex: 1, border: '1px solid #ccc', padding: '15px' }}>
          <h3>Resumo da Venda</h3>
          <p><b>Total: R$ {calcularTotal().toFixed(2)}</b></p>
          
          <div style={{ marginBottom: '10px' }}>
            <label>Cliente: </label>
            <input
              type="text"
              value={clienteNome}
              onChange={(e) => setClienteNome(e.target.value)}
              placeholder="Nome do cliente"
              style={{ width: '100%', padding: '8px' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>Pagamento: </label>
            <select
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
              style={{ width: '100%', padding: '8px' }}
            >
              <option value="PIX">PIX</option>
              <option value="CARTAO_CREDITO">Cartão de Crédito</option>
              <option value="CARTAO_DEBITO">Cartão de Débito</option>
              <option value="DINHEIRO">Dinheiro</option>
            </select>
          </div>

          <button
            onClick={finalizarVenda}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#2e7d32',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Finalizar Venda
          </button>
        </div>
      </div>
    </div>
  );
}
