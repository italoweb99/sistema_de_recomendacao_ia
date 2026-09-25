import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import type { Midia, CasoDeTeste, RecomendacaoResultado, Metricas } from './types.tsx';

const STORAGE_KEY = 'gabaritos_recomendador_v1';

export default function PainelRecomendador() {
  // --- ESTADOS GLOBAIS ---
  const [abaAtiva, setAbaAtiva] = useState<1 | 2>(1);
  const [tokenJWT, setTokenJWT] = useState<string>(() => localStorage.getItem('token_jwt') || '');
  const [email, setEmail] = useState<string>('');
  const [senha, setSenha] = useState<string>('');

  // Gabaritos persistidos localmente
  const [gabaritos, setGabaritos] = useState<CasoDeTeste[]>(() => {
    const salvos = localStorage.getItem(STORAGE_KEY);
    return salvos ? JSON.parse(salvos) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gabaritos));
  }, [gabaritos]);

  // --- ESTADOS DA ABA 1 (COLETA) ---
  const [queryTeste, setQueryTeste] = useState<string>('');
  const [usuarioId, setUsuarioId] = useState<string>('');
  const [termoBuscaBanco, setTermoBuscaBanco] = useState<string>('');
  const [midiasBanco, setMidiasBanco] = useState<Midia[]>([]);
  const [midiasSelecionadas, setMidiasSelecionadas] = useState<Midia[]>([]);

  // --- ESTADOS DA ABA 2 (AVALIAÇÃO) ---
  const [gabaritoSelecionadoId, setGabaritoSelecionadoId] = useState<string>('');
  const [pesoSemantico, setPesoSemantico] = useState<number>(0.4);
  const [pesoTextual, setPesoTextual] = useState<number>(0.3);
  const [pesoColaborativo, setPesoColaborativo] = useState<number>(0.3);
  const [resultadosRecomendacao, setResultadosRecomendacao] = useState<RecomendacaoResultado[]>([]);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [avaliacoesManuais, setAvaliacoesManuais] = useState<Record<number, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- AUTENTICAÇÃO ---
  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    const mockToken = `bearer_${Date.now()}`;
    setTokenJWT(mockToken);
    localStorage.setItem('token_jwt', mockToken);
    alert('Autenticado com sucesso!');
  };

  // --- ABA 1: COLETA ---
  const handleBuscarMidias = async (e: FormEvent) => {
    e.preventDefault();
    if (!termoBuscaBanco.trim()) return;

    try {
      const res = await fetch(`/api/midias/buscar?q=${encodeURIComponent(termoBuscaBanco)}`, {
        headers: { Authorization: `Bearer ${tokenJWT}` }
      });
      if (res.ok) {
        const data: Midia[] = await res.json();
        setMidiasBanco(data);
      } else {
        throw new Error('Falha na resposta da API');
      }
    } catch {
      // Mock para desenvolvimento
      setMidiasBanco([
        { id: 101, titulo: 'De Volta para o Futuro', ano: 1985, tipo: 'Filme' },
        { id: 204, titulo: 'Interstellar', ano: 2014, tipo: 'Filme' },
        { id: 305, titulo: 'Dark', ano: 2017, tipo: 'Série' }
      ]);
    }
  };

  const toggleSelecaoMidia = (midia: Midia) => {
    setMidiasSelecionadas((prev) =>
      prev.some((m) => m.id === midia.id)
        ? prev.filter((m) => m.id !== midia.id)
        : [...prev, midia]
    );
  };

  const handleSalvarGabarito = () => {
    if (!queryTeste.trim() || midiasSelecionadas.length === 0) {
      alert('Preencha a Query de Teste e selecione ao menos uma mídia!');
      return;
    }

    const novoCaso: CasoDeTeste = {
      id: Date.now(),
      usuario_id: usuarioId.trim() || `user_${Date.now()}`,
      query: queryTeste.trim(),
      midias_esperadas: midiasSelecionadas
    };

    setGabaritos((prev) => [...prev, novoCaso]);
    setQueryTeste('');
    setMidiasSelecionadas([]);
    alert('Gabarito gravado no navegador com sucesso!');
  };

  // --- GERENCIAMENTO DE JSON ---
  const handleExportarJSON = () => {
    if (gabaritos.length === 0) {
      alert('Nenhum gabarito para exportar!');
      return;
    }
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(gabaritos, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'casos_de_teste.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportarJSON = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const conteudo = evt.target?.result as string;
        const dados: CasoDeTeste[] = JSON.parse(conteudo);
        if (Array.isArray(dados)) {
          setGabaritos(dados);
          alert(`${dados.length} gabaritos importados com sucesso!`);
        } else {
          alert('Formato inválido: O arquivo deve conter uma lista JSON.');
        }
      } catch {
        alert('Erro ao ler ou validar o arquivo JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLimparTudo = () => {
    if (confirm('Tem certeza que deseja apagar todos os gabaritos acumulados?')) {
      setGabaritos([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  // --- ABA 2: AVALIAÇÃO ---
  const handleReexecutarRecomendador = async () => {
    const gabaritoAtual = gabaritos.find((g) => String(g.id) === gabaritoSelecionadoId);
    if (!gabaritoAtual) {
      alert('Selecione um gabarito para avaliar!');
      return;
    }

    try {
      const res = await fetch('/api/midias/recomendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenJWT}`
        },
        body: JSON.stringify({
          query: gabaritoAtual.query,
          usuario_id: gabaritoAtual.usuario_id,
          pesos: { semantico: pesoSemantico, textual: pesoTextual, colaborativo: pesoColaborativo }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const recomendacoes: RecomendacaoResultado[] = data.recomendacoes || [];
        setResultadosRecomendacao(recomendacoes);
        calcularMetricas(recomendacoes, gabaritoAtual.midias_esperadas);
      } else {
        throw new Error('Erro na API');
      }
    } catch {
      // Mock Fallback
      const mockResultados: RecomendacaoResultado[] = [
        { id: 101, titulo: 'De Volta para o Futuro', score: 0.92 },
        { id: 999, titulo: 'Matrix', score: 0.85 },
        { id: 204, titulo: 'Interstellar', score: 0.78 }
      ];
      setResultadosRecomendacao(mockResultados);
      calcularMetricas(mockResultados, gabaritoAtual.midias_esperadas);
    }
  };

  const calcularMetricas = (retornados: RecomendacaoResultado[], esperados: Midia[]) => {
    const idsEsperados = new Set(esperados.map((e) => e.id));
    const acertos = retornados.filter((r) => idsEsperados.has(r.id)).length;
    const recall = idsEsperados.size > 0 ? (acertos / idsEsperados.size) * 100 : 0;

    setMetricas({
      totalEsperado: idsEsperados.size,
      acertos,
      recallAt12: recall.toFixed(1)
    });
  };

  const handleExportarCSV = () => {
    const linhas = [['Midia ID', 'Titulo', 'Score', 'Relevante Manual']];
    resultadosRecomendacao.forEach((item) => {
      const aval = avaliacoesManuais[item.id] !== undefined ? avaliacoesManuais[item.id] : '';
      linhas.push([String(item.id), `"${item.titulo}"`, String(item.score), String(aval)]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + linhas.map((e) => e.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = encodeURI(csvContent);
    a.download = `avaliacoes_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="max-w-5xl mx-auto p-6 font-sans text-slate-800">
      {/* CABEÇALHO */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Painel de Otimização & Gabaritos</h1>

        <form onSubmit={handleLogin} className="flex gap-2 w-full md:w-auto">
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-md transition-colors"
          >
            {tokenJWT ? 'Autenticado' : 'Login'}
          </button>
        </form>
      </header>

      {/* BARRA DE GERENCIAMENTO DE ARQUIVOS */}
      <div className="flex flex-wrap justify-between items-center bg-slate-100 p-4 rounded-lg mb-6 gap-3 border border-slate-200">
        <div className="text-sm font-medium text-slate-700">
          Gabaritos Acumulados: <span className="font-bold text-blue-600">{gabaritos.length}</span>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleImportarJSON}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium rounded-md transition-colors"
          >
            📂 Importar JSON
          </button>
          <button
            onClick={handleExportarJSON}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            💾 Exportar JSON
          </button>
          <button
            onClick={handleLimparTudo}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            🗑️ Limpar
          </button>
        </div>
      </div>

      {/* NAVEGAÇÃO POR ABAS */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 pb-2">
        <button
          onClick={() => setAbaAtiva(1)}
          className={`px-4 py-2 font-semibold text-sm rounded-t-md transition-colors ${abaAtiva === 1
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
        >
          Aba 1: Coleta de Ground Truth
        </button>
        <button
          onClick={() => setAbaAtiva(2)}
          className={`px-4 py-2 font-semibold text-sm rounded-t-md transition-colors ${abaAtiva === 2
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
        >
          Aba 2: Avaliação de Pesos
        </button>
      </div>

      {/* CONTEÚDO ABA 1 */}
      {abaAtiva === 1 && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold mb-3 text-slate-900">1. Definir Query de Teste</h3>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                placeholder='Frase de Busca (Ex: "filmes de viagem no tempo")'
                value={queryTeste}
                onChange={(e) => setQueryTeste(e.target.value)}
                className="flex-[2] p-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="ID do Usuário (Opcional)"
                value={usuarioId}
                onChange={(e) => setUsuarioId(e.target.value)}
                className="flex-1 p-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <hr className="border-slate-200" />

          <div>
            <h3 className="text-lg font-bold mb-3 text-slate-900">2. Encontrar Mídias no Banco Próprio</h3>
            <form onSubmit={handleBuscarMidias} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Buscar título da mídia no banco..."
                value={termoBuscaBanco}
                onChange={(e) => setTermoBuscaBanco(e.target.value)}
                className="flex-1 p-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-medium text-sm rounded-md transition-colors"
              >
                Pesquisar
              </button>
            </form>

            {/* CARDS DE MÍDIAS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {midiasBanco.map((item) => {
                const selecionado = midiasSelecionadas.some((m) => m.id === item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelecaoMidia(item)}
                    className={`p-3 border-2 rounded-lg cursor-pointer transition-all flex flex-col justify-between ${selecionado
                        ? 'border-emerald-500 bg-emerald-50/50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                  >
                    <div>
                      <strong className="block text-slate-800">{item.titulo}</strong>
                      <span className="text-xs text-slate-500">
                        {item.tipo} • {item.ano}
                      </span>
                    </div>
                    {selecionado && (
                      <span className="text-xs font-bold text-emerald-600 mt-2">Gabarito ✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSalvarGabarito}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-md transition-colors"
            >
              Salvar este Gabarito ({midiasSelecionadas.length} selecionadas)
            </button>
          </div>
        </div>
      )}

      {/* CONTEÚDO ABA 2 */}
      {abaAtiva === 2 && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold mb-2 text-slate-900">1. Selecionar Gabarito de Teste</h3>
            <select
              value={gabaritoSelecionadoId}
              onChange={(e) => setGabaritoSelecionadoId(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Escolha um Gabarito ({gabaritos.length} disponíveis) --</option>
              {gabaritos.map((g) => (
                <option key={g.id} value={g.id}>
                  [{g.usuario_id}] "{g.query}" ({g.midias_esperadas.length} mídias esperadas)
                </option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-3 text-slate-900">2. Ajustar Pesos do Algoritmo</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Semântico: <span className="text-blue-600">{pesoSemantico}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={pesoSemantico}
                  onChange={(e) => setPesoSemantico(parseFloat(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Textual: <span className="text-blue-600">{pesoTextual}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={pesoTextual}
                  onChange={(e) => setPesoTextual(parseFloat(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Colaborativo: <span className="text-blue-600">{pesoColaborativo}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={pesoColaborativo}
                  onChange={(e) => setPesoColaborativo(parseFloat(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleReexecutarRecomendador}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-md transition-colors"
          >
            Reexecutar Recomendador
          </button>

          {/* MÉTRICAS */}
          {metricas && (
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <h4 className="font-bold text-blue-900 mb-1">Métricas de Qualidade</h4>
              <p className="text-sm text-blue-800">
                Acertos: <strong>{metricas.acertos}</strong> de <strong>{metricas.totalEsperado}</strong>
              </p>
              <p className="text-lg font-extrabold text-blue-600 mt-1">
                Recall@12: {metricas.recallAt12}%
              </p>
            </div>
          )}

          {/* LISTA DE RESULTADOS */}
          {resultadosRecomendacao.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900">Resultados Retornados</h3>
                <button
                  onClick={handleExportarCSV}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-md transition-colors"
                >
                  Exportar Avaliações em CSV
                </button>
              </div>

              <div className="space-y-2">
                {resultadosRecomendacao.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-md shadow-sm"
                  >
                    <div className="text-sm">
                      <strong className="text-slate-900 mr-2">#{index + 1}</strong>
                      <span className="font-medium text-slate-800">{item.titulo}</span>
                      <span className="text-slate-500 text-xs ml-2">(Score: {item.score})</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setAvaliacoesManuais((p) => ({ ...p, [item.id]: true }))}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${avaliacoesManuais[item.id] === true
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                      >
                        👍 Relevante
                      </button>
                      <button
                        onClick={() => setAvaliacoesManuais((p) => ({ ...p, [item.id]: false }))}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${avaliacoesManuais[item.id] === false
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                      >
                        👎 Não Relevante
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}