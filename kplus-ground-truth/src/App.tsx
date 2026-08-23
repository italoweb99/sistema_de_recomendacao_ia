import React, { useState, useEffect, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { Midia, CasoDeTeste, RecomendacaoResultado, Metricas } from './Components/types';

const STORAGE_KEY = 'kplus_gabaritos_v1';
const API_BASE_URL = 'http://localhost:8000';

export default function PainelRecomendador() {
  // --- ESTADOS GLOBAIS & AUTH ---
  const [abaAtiva, setAbaAtiva] = useState<1 | 2>(1);
  const [tokenJWT, setTokenJWT] = useState<string>(() => localStorage.getItem('kplus_token') || '');
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

  // --- ABA 1: COLETA (GROUND TRUTH) ---
  const [queryTeste, setQueryTeste] = useState<string>('');
  const [usuarioId, setUsuarioId] = useState<string>('');
  const [termoBuscaBanco, setTermoBuscaBanco] = useState<string>('');
  const [midiasBanco, setMidiasBanco] = useState<Midia[]>([]);
  const [midiasSelecionadas, setMidiasSelecionadas] = useState<Midia[]>([]);
  const [carregandoBusca, setCarregandoBusca] = useState<boolean>(false);

  // --- ABA 2: AVALIAÇÃO DO HYBRID ENGINE ---
  const [gabaritoSelecionadoId, setGabaritoSelecionadoId] = useState<string>('');
  const [pesoSemantico, setPesoSemantico] = useState<number>(0.5);
  const [pesoTextual, setPesoTextual] = useState<number>(0.2);
  const [pesoColaborativo, setPesoColaborativo] = useState<number>(0.3);
  const [resultadosRecomendacao, setResultadosRecomendacao] = useState<RecomendacaoResultado[]>([]);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [avaliacoesManuais, setAvaliacoesManuais] = useState<Record<number, boolean>>({});
  const [carregandoRecomendacao, setCarregandoRecomendacao] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- AUTENTICAÇÃO KPLUS-API ---
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', senha);

      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });

      if (!res.ok) throw new Error('Falha na autenticação');

      const data = await res.json();
      const token = data.access_token;
      setTokenJWT(token);
      localStorage.setItem('kplus_token', token);
      alert('Autenticado com sucesso na kplus-api!');
    } catch {
      alert('Erro ao realizar login. Verifique as credenciais ou a conexão com a kplus-api.');
    }
  };

  // --- INTEGRAÇÃO BUSCA DE MÍDIAS ---
  const handleBuscarMidias = async (e: FormEvent) => {
    e.preventDefault();
    if (!termoBuscaBanco.trim()) return;

    setCarregandoBusca(true);
    try {
      const params = new URLSearchParams({
        usr_query: termoBuscaBanco,
        limit: '20'
      });

      const res = await fetch(`${API_BASE_URL}/midias/recomendar?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenJWT ? { Authorization: `Bearer ${tokenJWT}` } : {})
        }
      });

      if (!res.ok) throw new Error('Erro ao consultar endpoint de mídias');

      const rawData = await res.json();
      
      const data: Midia[] = rawData.map((item: any) => ({
        id: item.id_tmdb ?? item.id,
        titulo: item.titulo,
        tipo: item.tipo,
        sinopse: item.sinopse,
        generos: item.generos,
        url_capa: item.url_capa
      }));

      setMidiasBanco(data);
    } catch {
      alert('Não foi possível conectar à kplus-api.');
    } finally {
      setCarregandoBusca(false);
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
    alert('Gabarito gravado com sucesso!');
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
    downloadAnchor.setAttribute('download', 'kplus_casos_de_teste.json');
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
          alert(`${dados.length} gabaritos importados!`);
        } else {
          alert('Formato inválido: O arquivo deve conter uma lista JSON.');
        }
      } catch {
        alert('Erro ao ler o arquivo JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLimparTudo = () => {
    if (confirm('Tem certeza que deseja apagar todos os gabaritos?')) {
      setGabaritos([]);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  // --- INTEGRAÇÃO COM /MIDIAS/RECOMENDAR ---
  const handleReexecutarRecomendador = async () => {
    const gabaritoAtual = gabaritos.find((g) => String(g.id) === gabaritoSelecionadoId);
    if (!gabaritoAtual) {
      alert('Selecione um gabarito para avaliar!');
      return;
    }

    setCarregandoRecomendacao(true);
    try {
      const params = new URLSearchParams({
        usr_query: gabaritoAtual.query,
        peso_semantico: String(pesoSemantico),
        peso_textual: String(pesoTextual),
        peso_colaborativo: String(pesoColaborativo),
        limit: '12'
      });

      const res = await fetch(`${API_BASE_URL}/midias/recomendar?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenJWT ? { Authorization: `Bearer ${tokenJWT}` } : {})
        }
      });

      if (!res.ok) throw new Error('Falha ao processar recomendação');

      const rawData = await res.json();
      
      const recomendacoes: RecomendacaoResultado[] = rawData.map((item: any) => ({
        id: item.id_tmdb ?? item.id,
        titulo: item.titulo,
        tipo: item.tipo,
        sinopse: item.sinopse,
        generos: item.generos,
        url_capa: item.url_capa,
        score: item.score_final ?? item.score ?? 0
      }));

      setResultadosRecomendacao(recomendacoes);
      calcularMetricas(recomendacoes, gabaritoAtual.midias_esperadas);
    } catch {
      alert('Erro ao chamar o motor de recomendação da kplus-api.');
    } finally {
      setCarregandoRecomendacao(false);
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
    a.download = `avaliacoes_kplus_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="max-w-5xl mx-auto p-6 font-sans text-slate-800">
      {/* CABEÇALHO DA API */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">kplus - Painel de Ground Truth</h1>
          <p className="text-xs text-slate-500">Conectado a: {API_BASE_URL}</p>
        </div>

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
            {tokenJWT ? 'Autenticado ✓' : 'Login API'}
          </button>
        </form>
      </header>

      {/* GERENCIAMENTO DE ARQUIVOS */}
      <div className="flex flex-wrap justify-between items-center bg-slate-100 p-4 rounded-lg mb-6 gap-3 border border-slate-200">
        <div className="text-sm font-medium text-slate-700">
          Gabaritos Cadastrados: <span className="font-bold text-blue-600">{gabaritos.length}</span>
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

      {/* NAVEGAÇÃO DE ABAS */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 pb-2">
        <button
          onClick={() => setAbaAtiva(1)}
          className={`px-4 py-2 font-semibold text-sm rounded-t-md transition-colors ${
            abaAtiva === 1
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Aba 1: Coleta de Ground Truth
        </button>
        <button
          onClick={() => setAbaAtiva(2)}
          className={`px-4 py-2 font-semibold text-sm rounded-t-md transition-colors ${
            abaAtiva === 2
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Aba 2: Avaliação de Pesos (Híbrido)
        </button>
      </div>

      {/* ABA 1 */}
      {abaAtiva === 1 && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold mb-3 text-slate-900">1. Definir Query de Teste</h3>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                placeholder='Query de Busca (Ex: "séries de ficção com viagem no tempo")'
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
            <h3 className="text-lg font-bold mb-3 text-slate-900">2. Mídias no Catálogo kplus</h3>
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
                disabled={carregandoBusca}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-medium text-sm rounded-md transition-colors disabled:opacity-50"
              >
                {carregandoBusca ? 'Buscando...' : 'Pesquisar'}
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {midiasBanco.map((item) => {
                const selecionado = midiasSelecionadas.some((m) => m.id === item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelecaoMidia(item)}
                    className={`p-3 border-2 rounded-lg cursor-pointer transition-all flex flex-col justify-between ${
                      selecionado
                        ? 'border-emerald-500 bg-emerald-50/50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <strong className="block text-slate-800">{item.titulo}</strong>
                      <img src = {item.url_capa}/>
                      <span className="text-xs text-slate-500">
                        {item.tipo || 'Mídia'}
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

      {/* ABA 2 */}
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
            <h3 className="text-lg font-bold mb-3 text-slate-900">2. Pesos do Motor Híbrido</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                <label className="text-sm font-semibold text-slate-700 block mb-1">
                  Semântico (BERT/Embeddings): <span className="text-blue-600">{pesoSemantico}</span>
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
                  Textual (Full-Text Search): <span className="text-blue-600">{pesoTextual}</span>
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
                  Colaborativo (Ratings): <span className="text-blue-600">{pesoColaborativo}</span>
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
            disabled={carregandoRecomendacao}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-md transition-colors disabled:opacity-50"
          >
            {carregandoRecomendacao ? 'Executando Motor...' : 'Reexecutar Recomendador'}
          </button>

          {/* MÉTRICAS */}
          {metricas && (
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <h4 className="font-bold text-blue-900 mb-1">Métricas de Qualidade (Precision / Recall)</h4>
              <p className="text-sm text-blue-800">
                Acertos: <strong>{metricas.acertos}</strong> de <strong>{metricas.totalEsperado}</strong>
              </p>
              <p className="text-lg font-extrabold text-blue-600 mt-1">
                Recall@12: {metricas.recallAt12}%
              </p>
            </div>
          )}

          {/* RESULTADOS DA KPLUS-API */}
          {resultadosRecomendacao.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900">Recomendações da kplus-api</h3>
                <button
                  onClick={handleExportarCSV}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-md transition-colors"
                >
                  Exportar CSV
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
                      <span className="text-slate-500 text-xs ml-2">(Score Híbrido: {item.score})</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setAvaliacoesManuais((p) => ({ ...p, [item.id]: true }))}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                          avaliacoesManuais[item.id] === true
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        👍 Relevante
                      </button>
                      <button
                        onClick={() => setAvaliacoesManuais((p) => ({ ...p, [item.id]: false }))}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                          avaliacoesManuais[item.id] === false
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