import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import {
  Search,
  Sparkles,
  Star,
  Check,
  Copy,
  RefreshCw,
  User,
  LogIn,
  LogOut,
  Film,
  Tv,
  ChevronDown,
  ChevronUp,
  Code2,
  Database,
  Activity,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import type { Midia, ApiInspectorData } from './types';

// Pesos calibrados do motor híbrido triplo (Fixos no código)
const PESO_SEMANTICO = 0.5;
const PESO_TEXTUAL = 0.3;
const PESO_COLABORATIVO = 0.2;

interface ApiTesterProps {
  apiBaseUrl: string;
  onUpdateApiBaseUrl: (url: string) => void;
  tokenJWT: string;
  onSetToken: (token: string) => void;
}

const SUGESTOES_BUSCA = [
  'Séries de ficção científica com viagem no tempo',
  'Filmes de suspense psicológico sombrio com plot twist',
  'Comédias leves e divertidas para assistir em família',
  'Ação no espaço com batalhas épicas intergalácticas',
  'Dramas emocionantes e inspiradores baseados em fatos reais',
  'Animações premiadas com fantasia e aventura',
];

export default function ApiTester({
  apiBaseUrl,
  onUpdateApiBaseUrl,
  tokenJWT,
  onSetToken,
}: ApiTesterProps) {
  // Configurações da API
  const [urlConfig, setUrlConfig] = useState<string>(apiBaseUrl);
  const [statusApi, setStatusApi] = useState<'online' | 'offline' | 'checando'>('checando');
  const [latenciaApi, setLatenciaApi] = useState<number | null>(null);

  // Parâmetros de Recomendação
  const [query, setQuery] = useState<string>('viagem no tempo e realidades paralelas');
  const [modo, setModo] = useState<'busca' | 'feed'>('busca');
  const [limite, setLimite] = useState<number>(12);

  // Resultados & Feedback
  const [carregando, setCarregando] = useState<boolean>(false);
  const [midias, setMidias] = useState<Midia[]>([]);
  const [sinopsesAbertas, setSinopsesAbertas] = useState<Record<number, boolean>>({});
  const [avaliacoesUsuario, setAvaliacoesUsuario] = useState<Record<number, number>>({});
  const [avaliandoId, setAvaliandoId] = useState<number | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [erroRequisicao, setErroRequisicao] = useState<string | null>(null);

  // Inspetor de API
  const [mostrarInspetor, setMostrarInspetor] = useState<boolean>(false);
  const [dadosInspetor, setDadosInspetor] = useState<ApiInspectorData | null>(null);
  const [copiado, setCopiado] = useState<boolean>(false);

  // Modal de Autenticação
  const [mostrarModalAuth, setMostrarModalAuth] = useState<boolean>(false);
  const [abaAuth, setAbaAuth] = useState<'login' | 'registro'>('login');
  const [emailAuth, setEmailAuth] = useState<string>('');
  const [senhaAuth, setSenhaAuth] = useState<string>('');
  const [nomeAuth, setNomeAuth] = useState<string>('');
  const [carregandoAuth, setCarregandoAuth] = useState<boolean>(false);
  const [usuarioNome, setUsuarioNome] = useState<string>(() => localStorage.getItem('kplus_user_nome') || '');

  // Checar saúde da API na montagem ou quando a URL muda
  useEffect(() => {
    checarSaudeApi(apiBaseUrl);
  }, [apiBaseUrl]);

  // Executa busca inicial automaticamente ao carregar
  useEffect(() => {
    if (statusApi === 'online' && midias.length === 0 && !carregando) {
      executarRecomendacao();
    }
  }, [statusApi]);

  const checarSaudeApi = async (url: string) => {
    setStatusApi('checando');
    const t0 = performance.now();
    try {
      const res = await fetch(`${url}/health`, { method: 'GET' });
      const t1 = performance.now();
      if (res.ok) {
        setStatusApi('online');
        setLatenciaApi(Math.round(t1 - t0));
      } else {
        setStatusApi('offline');
        setLatenciaApi(null);
      }
    } catch {
      setStatusApi('offline');
      setLatenciaApi(null);
    }
  };

  // --- REQUISIÇÃO PRINCIPAL /MIDIAS/RECOMENDAR ---
  const executarRecomendacao = async (e?: FormEvent) => {
    if (e) e.preventDefault();

    setCarregando(true);
    setErroRequisicao(null);
    const t0 = performance.now();

    // Pesos fixos calibrados do recomendador híbrido
    const queryParams: Record<string, string> = {
      limit: String(limite),
      peso_semantico: String(PESO_SEMANTICO),
      peso_textual: String(PESO_TEXTUAL),
      peso_colaborativo: String(PESO_COLABORATIVO),
    };

    if (modo === 'busca' && query.trim()) {
      queryParams.usr_query = query.trim();
    }

    const queryString = new URLSearchParams(queryParams).toString();
    const endpointUrl = `${apiBaseUrl}/midias/recomendar?${queryString}`;

    try {
      const res = await fetch(endpointUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenJWT ? { Authorization: `Bearer ${tokenJWT}` } : {}),
        },
      });

      const t1 = performance.now();
      const duracao = Math.round(t1 - t0);

      const dados = await res.json();

      setDadosInspetor({
        url: endpointUrl,
        method: 'GET',
        status: res.status,
        statusText: res.statusText,
        durationMs: duracao,
        requestParams: queryParams,
        responsePayload: dados,
        timestamp: new Date().toLocaleTimeString(),
      });

      if (!res.ok) {
        throw new Error(dados.detail || `Erro HTTP ${res.status}`);
      }

      const listaMapeada: Midia[] = (Array.isArray(dados) ? dados : []).map((item: any) => ({
        id: item.id_tmdb ?? item.id,
        id_tmdb: item.id_tmdb ?? item.id,
        titulo: item.titulo,
        tipo: item.tipo,
        sinopse: item.sinopse,
        generos: item.generos,
        url_capa: item.url_capa,
        score: item.score_final ?? item.score ?? 0,
        score_final: item.score_final ?? item.score ?? 0,
      }));

      setMidias(listaMapeada);
      setStatusApi('online');
      setLatenciaApi(duracao);
    } catch (err: any) {
      setErroRequisicao(err.message || 'Falha ao se comunicar com a API');
      setStatusApi('offline');
    } finally {
      setCarregando(false);
    }
  };

  // --- AVALIAR MÍDIA (POST /midias/avaliar) ---
  const handleAvaliarMidia = async (midia: Midia, nota: number) => {
    if (!tokenJWT) {
      setMostrarModalAuth(true);
      return;
    }

    setAvaliandoId(midia.id);
    try {
      const res = await fetch(`${apiBaseUrl}/midias/avaliar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenJWT}`,
        },
        body: JSON.stringify({
          id_tmdb: midia.id_tmdb ?? midia.id,
          tipo: midia.tipo || 'movie',
          nota: nota,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Falha ao registrar avaliação');
      }

      setAvaliacoesUsuario((prev) => ({ ...prev, [midia.id]: nota }));
      setMensagemSucesso(`Avaliação de ${nota} estrelas salva com sucesso para "${midia.titulo}"!`);
      setTimeout(() => setMensagemSucesso(null), 4000);
    } catch (err: any) {
      alert(`Erro ao avaliar: ${err.message}`);
    } finally {
      setAvaliandoId(null);
    }
  };

  // --- AUTENTICAÇÃO RÁPIDA ---
  const handleSubmeterAuth = async (e: FormEvent) => {
    e.preventDefault();
    setCarregandoAuth(true);

    try {
      if (abaAuth === 'login') {
        const formData = new URLSearchParams();
        formData.append('username', emailAuth);
        formData.append('password', senhaAuth);

        const res = await fetch(`${apiBaseUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Falha no login');

        onSetToken(data.access_token);
        setUsuarioNome(data.nome || emailAuth);
        localStorage.setItem('kplus_user_nome', data.nome || emailAuth);
        setMostrarModalAuth(false);
        setMensagemSucesso(`Bem-vindo de volta, ${data.nome}!`);
      } else {
        const res = await fetch(`${apiBaseUrl}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: nomeAuth,
            email: emailAuth,
            senha: senhaAuth,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Falha no cadastro');

        onSetToken(data.access_token);
        setUsuarioNome(data.nome || nomeAuth);
        localStorage.setItem('kplus_user_nome', data.nome || nomeAuth);
        setMostrarModalAuth(false);
        setMensagemSucesso(`Usuário ${data.nome} cadastrado e autenticado!`);
      }
    } catch (err: any) {
      alert(`Erro de autenticação: ${err.message}`);
    } finally {
      setCarregandoAuth(false);
    }
  };

  const handleCriarUsuarioTeste = async () => {
    setCarregandoAuth(true);
    const idRandom = Math.floor(1000 + Math.random() * 9000);
    const emailGerado = `tester_${idRandom}@kplus.com`;
    const nomeGerado = `Tester #${idRandom}`;
    const senhaGerada = 'teste123';

    try {
      const res = await fetch(`${apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nomeGerado,
          email: emailGerado,
          senha: senhaGerada,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao gerar usuário de teste');

      onSetToken(data.access_token);
      setUsuarioNome(nomeGerado);
      localStorage.setItem('kplus_user_nome', nomeGerado);
      setMostrarModalAuth(false);
      setMensagemSucesso(`Conta de teste gerada automaticamente: ${nomeGerado}!`);
    } catch (err: any) {
      alert(`Não foi possível gerar usuário: ${err.message}`);
    } finally {
      setCarregandoAuth(false);
    }
  };

  const handleLogout = () => {
    onSetToken('');
    setUsuarioNome('');
    localStorage.removeItem('kplus_user_nome');
    localStorage.removeItem('kplus_token');
    setMensagemSucesso('Você encerrou a sessão.');
    setTimeout(() => setMensagemSucesso(null), 3000);
  };

  const copiarPayloadJson = () => {
    if (!dadosInspetor) return;
    navigator.clipboard.writeText(JSON.stringify(dadosInspetor.responsePayload, null, 2));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const toggleSinopse = (id: number) => {
    setSinopsesAbertas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* BARRA SUPERIOR DE CONEXÃO & AMBIENTE */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl shadow-xl border border-slate-700/60">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-3 w-3 relative">
                {statusApi === 'online' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${statusApi === 'online'
                      ? 'bg-emerald-500'
                      : statusApi === 'checando'
                        ? 'bg-amber-400'
                        : 'bg-rose-500'
                    }`}
                ></span>
              </span>
              <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                Playground do Sistema de Recomendação Híbrido
              </h2>
            </div>
            <p className="text-xs text-slate-300">
              Teste em tempo real a fusão entre Embeddings Multilíngues (BERT), Busca Textual e Filtragem Colaborativa.
            </p>
          </div>

          {/* CONTROLES DE ENDPOINT & AUTH */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de URL da API */}
            <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded-xl px-2.5 py-1.5 gap-2 text-xs">
              <Database className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={urlConfig}
                onChange={(e) => setUrlConfig(e.target.value)}
                onBlur={() => {
                  if (urlConfig !== apiBaseUrl) onUpdateApiBaseUrl(urlConfig);
                }}
                className="bg-transparent text-slate-200 outline-none w-48 sm:w-60 font-mono text-xs"
                placeholder="http://localhost:8000"
              />
              <button
                onClick={() => {
                  onUpdateApiBaseUrl(urlConfig);
                  checarSaudeApi(urlConfig);
                }}
                title="Testar Conexão"
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${statusApi === 'checando' ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Status e Latência */}
            <div className="flex items-center gap-2">
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-semibold border flex items-center gap-1.5 ${statusApi === 'online'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                    : statusApi === 'checando'
                      ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                      : 'bg-rose-950/80 text-rose-300 border-rose-700/60'
                  }`}
              >
                <Activity className="w-3 h-3" />
                {statusApi === 'online'
                  ? `Online (${latenciaApi ?? 0}ms)`
                  : statusApi === 'checando'
                    ? 'Verificando...'
                    : 'Desconectado'}
              </span>

              {/* Botão de Usuário / Login */}
              {tokenJWT ? (
                <div className="flex items-center gap-2 bg-indigo-950/80 border border-indigo-700/60 px-3 py-1 rounded-xl text-xs">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-semibold text-indigo-200 max-w-[120px] truncate">
                    {usuarioNome || 'Usuário Conectado'}
                  </span>
                  <button
                    onClick={handleLogout}
                    title="Encerrar Sessão"
                    className="text-slate-400 hover:text-rose-400 ml-1 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setMostrarModalAuth(true)}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-all shadow-md shadow-indigo-600/30"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Entrar / Cadastro
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FEEDBACK TOAST DE SUCESSO OU ERRO */}
      {mensagemSucesso && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl flex items-center justify-between text-sm animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">{mensagemSucesso}</span>
          </div>
          <button onClick={() => setMensagemSucesso(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {erroRequisicao && (
        <div className="bg-rose-50 border border-rose-300 text-rose-800 px-4 py-3 rounded-xl flex items-center justify-between text-sm animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>
              <strong>Erro ao conectar com a API:</strong> {erroRequisicao}. Certifique-se de que o backend FastAPI está rodando em <code>{apiBaseUrl}</code>.
            </span>
          </div>
          <button onClick={() => setErroRequisicao(null)} className="text-rose-700 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* CAIXA DE BUSCA & CONFIGURAÇÃO DO MOTOR */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
        {/* SELETOR DE MODO (BUSCA vs EXPLORAÇÃO) */}
        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-100 pb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setModo('busca')}
              className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${modo === 'busca'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              <Search className="w-4 h-4" />
              Busca Híbrida Ativa (Cenário A)
            </button>
            <button
              onClick={() => setModo('feed')}
              className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${modo === 'feed'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              <Sparkles className="w-4 h-4" />
              Feed por Popularidade / Ratings (Cenário B)
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Limite de Mídias:</span>
            <select
              value={limite}
              onChange={(e) => setLimite(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 bg-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value={6}>6 itens</option>
              <option value={12}>12 itens</option>
              <option value={18}>18 itens</option>
              <option value={24}>24 itens</option>
            </select>
          </div>
        </div>

        {/* INPUT DE BUSCA */}
        {modo === 'busca' && (
          <form onSubmit={executarRecomendacao} className="space-y-3">
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: filmes de ficção científica com viagem no tempo e realidades paralelas..."
                className="w-full pl-12 pr-32 py-3.5 bg-slate-50 border border-slate-300 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-base placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium"
              />
              <button
                type="submit"
                disabled={carregando}
                className="absolute right-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-lg transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                {carregando ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Recomendar
                  </>
                )}
              </button>
            </div>

            {/* SUGESTÕES RÁPIDAS (PROMPT CHIPS) */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                Sugestões rápidas:
              </span>
              {SUGESTOES_BUSCA.map((sugestao, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQuery(sugestao);
                  }}
                  className="text-xs bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 px-2.5 py-1 rounded-full transition-colors border border-slate-200/80"
                >
                  {sugestao}
                </button>
              ))}
            </div>
          </form>
        )}

        {modo === 'feed' && (
          <div className="bg-indigo-50/70 border border-indigo-200/80 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-indigo-900">
              <strong className="block font-bold">Modo de Exploração Sem Termo de Busca</strong>
              <span>
                {tokenJWT
                  ? 'Recomendando títulos de maior nota geral que você ainda não avaliou!'
                  : 'Recomendando os títulos mais bem avaliados da base pela média da comunidade.'}
              </span>
            </div>
            <button
              onClick={() => executarRecomendacao()}
              disabled={carregando}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-indigo-600/20 whitespace-nowrap flex items-center gap-2 justify-center"
            >
              {carregando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Carregar Feed
            </button>
          </div>
        )}

        {/* PESOS FIXADOS NO CÓDIGO (MOTOR HÍBRIDO) */}
        {modo === 'busca' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-700">Pesos do Motor Híbrido:</span>
              <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                <span className="bg-blue-50 text-blue-700 border border-blue-200/80 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                  🧠 Semântico (BERT): {PESO_SEMANTICO * 100}%
                </span>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                  📝 Textual (FTS): {PESO_TEXTUAL * 100}%
                </span>
                <span className="bg-amber-50 text-amber-700 border border-amber-200/80 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                  ⭐ Colaborativo: {PESO_COLABORATIVO * 100}%
                </span>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Pesos calibrados e fixados no código
            </span>
          </div>
        )}
      </div>

      {/* PAINEL DE RESULTADOS DAS MÍDIAS RECOMENDADAS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Film className="w-5 h-5 text-indigo-600" />
              Recomendações da API ({midias.length} mídias encontradas)
            </h3>
            <p className="text-xs text-slate-500">
              Mídias ranqueadas pela equação de score final do recomendador híbrido
            </p>
          </div>

          <button
            onClick={() => setMostrarInspetor(!mostrarInspetor)}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200"
          >
            <Code2 className="w-4 h-4 text-indigo-600" />
            {mostrarInspetor ? 'Ocultar Inspetor Técnico' : 'Inspecionar Chamada à API'}
            {dadosInspetor && (
              <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold">
                {dadosInspetor.durationMs}ms
              </span>
            )}
          </button>
        </div>

        {/* INSPETOR DE API (GAVETA EXPANSÍVEL) */}
        {mostrarInspetor && dadosInspetor && (
          <div className="bg-slate-950 text-slate-200 rounded-2xl p-4 font-mono text-xs shadow-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="bg-emerald-600 text-white px-2 py-0.5 rounded font-bold text-[10px]">
                  {dadosInspetor.method}
                </span>
                <span className="text-slate-300 truncate max-w-lg">{dadosInspetor.url}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-bold">{dadosInspetor.status} OK</span>
                <span className="text-slate-400">{dadosInspetor.durationMs}ms</span>
                <button
                  onClick={copiarPayloadJson}
                  className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded text-[11px] transition-colors"
                >
                  {copiado ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiado ? 'Copiado!' : 'Copiar JSON'}
                </button>
              </div>
            </div>

            <pre className="overflow-x-auto max-h-72 p-3 bg-slate-900/80 rounded-xl text-[11px] text-emerald-300">
              {JSON.stringify(dadosInspetor.responsePayload, null, 2)}
            </pre>
          </div>
        )}

        {/* LISTAGEM DE CARDS DE MÍDIAS */}
        {carregando ? (
          <div className="py-20 text-center space-y-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
            <p className="font-bold text-slate-700 text-base">Processando recomendação híbrida...</p>
            <p className="text-xs text-slate-400">
              Calculando distâncias cosseno no pgvector e combinando pesos normalizados.
            </p>
          </div>
        ) : midias.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <Film className="w-12 h-12 text-slate-300 mx-auto" />
            <h4 className="font-bold text-slate-700 text-lg">Nenhuma mídia encontrada</h4>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Tente pesquisar com outros termos de busca, ajuste os pesos do motor ou teste o modo feed.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {midias.map((midia, index) => {
              const sinopseAberta = !!sinopsesAbertas[midia.id];
              const scoreSeguro = midia.score ?? 0;
              const pontuacaoFormatada = (scoreSeguro * 100).toFixed(1);
              const avaliacaoAtual = avaliacoesUsuario[midia.id];

              return (
                <div
                  key={midia.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 flex flex-col justify-between group"
                >
                  <div>
                    {/* PÔSTER OU PLACEHOLDER */}
                    <div className="relative aspect-[2/3] w-full bg-slate-100 overflow-hidden">
                      {midia.url_capa ? (
                        <img
                          src={midia.url_capa}
                          alt={midia.titulo}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            // Fallback caso a imagem quebre
                            (e.target as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=60';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center bg-gradient-to-br from-slate-100 to-slate-200">
                          <Film className="w-12 h-12 mb-2 text-slate-300" />
                          <span className="text-xs font-semibold">Sem Imagem TMDB</span>
                        </div>
                      )}

                      {/* BADGE DE RANKING E TIPO */}
                      <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        <span className="bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-black px-2 py-0.5 rounded-lg shadow">
                          #{index + 1}
                        </span>
                        <span className="bg-indigo-900/80 backdrop-blur-md text-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 shadow">
                          {midia.tipo === 'tv' ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                          {midia.tipo === 'tv' ? 'Série' : 'Filme'}
                        </span>
                      </div>

                      {/* BADGE DE SCORE */}
                      <div className="absolute top-2 right-2">
                        <span
                          className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg shadow-lg backdrop-blur-md text-white ${scoreSeguro >= 0.7
                              ? 'bg-emerald-600/90'
                              : scoreSeguro >= 0.4
                                ? 'bg-blue-600/90'
                                : 'bg-indigo-600/90'
                            }`}
                        >
                          {pontuacaoFormatada}% Match
                        </span>
                      </div>
                    </div>

                    {/* CONTEÚDO TEXTUAL */}
                    <div className="p-4 space-y-2">
                      <h4 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2" title={midia.titulo}>
                        {midia.titulo}
                      </h4>

                      {midia.generos && (
                        <div className="flex flex-wrap gap-1">
                          {midia.generos
                            .split(',')
                            .slice(0, 3)
                            .map((gen, gIdx) => (
                              <span
                                key={gIdx}
                                className="text-[10px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-md"
                              >
                                {gen.trim()}
                              </span>
                            ))}
                        </div>
                      )}

                      {/* SINOPSE EXPANSÍVEL */}
                      {midia.sinopse && (
                        <div className="text-xs text-slate-600 pt-1">
                          <p className={`text-[11px] leading-relaxed ${sinopseAberta ? '' : 'line-clamp-2'}`}>
                            {midia.sinopse}
                          </p>
                          {midia.sinopse.length > 90 && (
                            <button
                              onClick={() => toggleSinopse(midia.id)}
                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 mt-0.5"
                            >
                              {sinopseAberta ? (
                                <>
                                  Menos <ChevronUp className="w-3 h-3" />
                                </>
                              ) : (
                                <>
                                  Ler mais <ChevronDown className="w-3 h-3" />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WIDGET DE AVALIAÇÃO COM ESTRELAS (INTERATIVO) */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-600">Sua Avaliação:</span>
                      {avaliacaoAtual ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" /> {avaliacaoAtual} estrelas
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">Não avaliado</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((estrela) => (
                          <button
                            key={estrela}
                            disabled={avaliandoId === midia.id}
                            onClick={() => handleAvaliarMidia(midia, estrela)}
                            title={`Avaliar com nota ${estrela}`}
                            className={`p-1 rounded hover:scale-125 transition-transform ${(avaliacaoAtual ?? 0) >= estrela ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                              }`}
                          >
                            <Star className="w-4 h-4 fill-current" />
                          </button>
                        ))}
                      </div>

                      {avaliandoId === midia.id && (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DE AUTENTICAÇÃO */}
      {mostrarModalAuth && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {abaAuth === 'login' ? 'Entrar no KPlus' : 'Criar Nova Conta'}
              </h3>
              <button onClick={() => setMostrarModalAuth(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ABAS DO MODAL */}
            <div className="flex gap-2 border-b border-slate-100 pb-2">
              <button
                type="button"
                onClick={() => setAbaAuth('login')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${abaAuth === 'login' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setAbaAuth('registro')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${abaAuth === 'registro' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                Cadastro
              </button>
            </div>

            <form onSubmit={handleSubmeterAuth} className="space-y-3">
              {abaAuth === 'registro' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={nomeAuth}
                    onChange={(e) => setNomeAuth(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={emailAuth}
                  onChange={(e) => setEmailAuth(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Senha</label>
                <input
                  type="password"
                  required
                  value={senhaAuth}
                  onChange={(e) => setSenhaAuth(e.target.value)}
                  placeholder="••••••••"
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={carregandoAuth}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 mt-2"
              >
                {carregandoAuth ? 'Autenticando...' : abaAuth === 'login' ? 'Acessar Conta' : 'Criar Conta'}
              </button>
            </form>

            {/* BOTÃO RÁPIDO PARA AVALIADORES/TESTADORES */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCriarUsuarioTeste}
                disabled={carregandoAuth}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                Gerar Usuário de Teste Automático (1 Clique)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
