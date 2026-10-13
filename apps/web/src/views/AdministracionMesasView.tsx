import { useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Plus, Search } from 'lucide-react';
import { EstadoMesa, type MesaDto } from '@floor/shared';
import { getMesas } from '../api/services/mesas.service';
import { queryKeys } from '../api/queryKeys';
import { MesaFormModal } from '../components/MesaFormModal';
import { BajaMesaModal } from '../components/BajaMesaModal';
import { cn } from '../lib/utils';

type CampoOrden = 'numeroMesa' | 'capacidad' | 'zona';
type SentidoOrden = 'asc' | 'desc';
type ModalState = { type: 'crear' } | { type: 'editar' | 'baja'; mesa: MesaDto } | null;
const filters = { incluirInactivas: true };
const emptyMesas: readonly MesaDto[] = [];

function EstadoBadge({ mesa }: { readonly mesa: MesaDto }) {
  const color = !mesa.activo
    ? 'bg-gray-50 text-muted border-border'
    : mesa.estadoFisico === EstadoMesa.LIBRE
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : 'bg-amber-50 text-amber-800 border-amber-200';
  const dot = !mesa.activo
    ? 'bg-gray-400'
    : mesa.estadoFisico === EstadoMesa.LIBRE
      ? 'bg-emerald-500'
      : 'bg-amber-500';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border',
        color,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} aria-hidden="true" />
      {mesa.activo ? mesa.estadoFisico : 'Dada de baja'}
    </span>
  );
}

function MesaAcciones({
  mesa,
  onAction,
}: {
  readonly mesa: MesaDto;
  readonly onAction: (type: 'editar' | 'baja', mesa: MesaDto) => void;
}) {
  const summaryRef = useRef<HTMLElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [opensUp, setOpensUp] = useState(false);
  if (!mesa.activo) return <span className="text-xs text-muted">Sin acciones</span>;
  return (
    <details
      ref={detailsRef}
      className="relative inline-block text-left shrink-0"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          if (detailsRef.current) detailsRef.current.open = false;
          summaryRef.current?.focus();
        }
      }}
    >
      <summary
        ref={summaryRef}
        role="button"
        aria-label={`Acciones de Mesa ${mesa.numeroMesa}`}
        onClick={() => {
          const bounds = summaryRef.current?.getBoundingClientRect();
          setOpensUp(
            Boolean(bounds && bounds.bottom + 100 > window.innerHeight && bounds.top >= 100),
          );
        }}
        className="h-control w-10 list-none [&::-webkit-details-marker]:hidden cursor-pointer rounded-control inline-flex items-center justify-center hover:bg-canvas focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
      </summary>
      <div
        className={cn(
          'absolute right-0 z-20 w-44 bg-surface border border-border rounded-control shadow-lg p-1',
          opensUp ? 'bottom-full mb-1' : 'top-full mt-1',
        )}
      >
        {(['editar', 'baja'] as const).map((type) => (
          <button
            key={type}
            type="button"
            className={cn(
              'h-control w-full px-3 text-sm text-left rounded-control hover:bg-canvas focus-visible:ring-2 focus-visible:ring-primary',
              type === 'baja' && 'text-red-700',
            )}
            onClick={() => {
              if (detailsRef.current) detailsRef.current.open = false;
              summaryRef.current?.focus();
              onAction(type, mesa);
            }}
          >
            {type === 'editar' ? 'Editar mesa' : 'Dar de baja'}
          </button>
        ))}
      </div>
    </details>
  );
}

export function AdministracionMesasView() {
  const id = useId();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [sort, setSort] = useState<{ campo: CampoOrden; sentido: SentidoOrden }>({
    campo: 'numeroMesa',
    sentido: 'asc',
  });
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useQuery({
    queryKey: queryKeys.mesas.list(filters),
    queryFn: () => getMesas(filters),
  });
  const mesas = query.data ?? emptyMesas;

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return mesas
      .filter(
        (mesa) =>
          (showInactive || mesa.activo) &&
          (!term ||
            String(mesa.numeroMesa).includes(term) ||
            mesa.zona.toLocaleLowerCase('es').includes(term)),
      )
      .sort((a, b) => {
        const difference =
          sort.campo === 'zona'
            ? a.zona.localeCompare(b.zona, 'es', { sensitivity: 'base', numeric: true })
            : a[sort.campo] - b[sort.campo];
        return (sort.sentido === 'asc' ? difference : -difference) || a.numeroMesa - b.numeroMesa;
      });
  }, [mesas, search, showInactive, sort]);

  const openAction = (type: 'editar' | 'baja', mesa: MesaDto) => {
    setNotice(null);
    setModal({ type, mesa });
  };
  const toggleSort = (campo: CampoOrden) =>
    setSort((previous) => ({
      campo,
      sentido: previous.campo === campo && previous.sentido === 'asc' ? 'desc' : 'asc',
    }));

  return (
    <section className="space-y-4" aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className="text-xl font-semibold text-ink">
          Configuración de mesas
        </h2>
        <p className="text-sm text-muted mt-1">
          Administra el número, la capacidad y la zona de cada mesa.
        </p>
      </div>
      <div className="bg-surface border border-border rounded-card p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <label htmlFor={`${id}-search`} className="block text-sm font-medium mb-1">
              Buscar mesas
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted" aria-hidden="true" />
              <input
                id={`${id}-search`}
                type="search"
                placeholder="Número o zona"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-control w-full pl-9 pr-3 border border-border bg-surface rounded-control text-sm focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={query.isPending || query.isError}
            onClick={(event) => {
              event.currentTarget.focus();
              setNotice(null);
              setModal({ type: 'crear' });
            }}
            className="h-control px-4 bg-primary hover:bg-primary-hover text-white rounded-control text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Crear mesa
          </button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm min-w-0">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="w-4 h-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">Mostrar mesas dadas de baja</span>
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor={`${id}-sort`}>Ordenar por</label>
            <select
              id={`${id}-sort`}
              value={`${sort.campo}:${sort.sentido}`}
              onChange={(event) => {
                const [campo, sentido] = event.target.value.split(':');
                setSort({ campo: campo as CampoOrden, sentido: sentido as SentidoOrden });
              }}
              className="h-control px-3 border border-border rounded-control bg-surface text-sm focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="numeroMesa:asc">Número: menor a mayor</option>
              <option value="numeroMesa:desc">Número: mayor a menor</option>
              <option value="capacidad:asc">Capacidad: menor a mayor</option>
              <option value="capacidad:desc">Capacidad: mayor a menor</option>
              <option value="zona:asc">Zona: A a Z</option>
              <option value="zona:desc">Zona: Z a A</option>
            </select>
          </div>
        </div>
      </div>

      {notice && (
        <p
          role="status"
          className="bg-emerald-50 border border-emerald-200 rounded-control p-3 text-sm text-emerald-800 flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      )}
      {query.isPending && (
        <div
          aria-busy="true"
          aria-label="Cargando mesas"
          className="bg-surface border border-border rounded-card p-4 space-y-3"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="h-10 rounded-control bg-gray-200 animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>
      )}
      {query.isError && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-card p-4 text-sm text-red-800 space-y-3"
        >
          <p>
            {query.error instanceof Error
              ? query.error.message
              : 'No se pudieron cargar las mesas.'}
          </p>
          <button
            type="button"
            onClick={() => {
              void query.refetch();
            }}
            className="h-control px-4 bg-surface border border-border rounded-control font-medium"
          >
            Reintentar
          </button>
        </div>
      )}

      {!query.isPending &&
        !query.isError &&
        (filtered.length === 0 ? (
          <div className="bg-surface border border-border rounded-card p-8 text-center space-y-2">
            <h3 className="text-lg font-semibold text-ink">
              {search.trim()
                ? 'No hay mesas que coincidan con la búsqueda'
                : showInactive
                  ? 'No hay mesas registradas'
                  : 'No hay mesas activas'}
            </h3>
            <p className="text-sm text-muted">
              {search.trim()
                ? 'Prueba con otro número o zona.'
                : 'Crea una mesa para configurar el plano.'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">
              {filtered.length} {filtered.length === 1 ? 'mesa mostrada' : 'mesas mostradas'}
            </p>
            <div className="hidden md:block bg-surface border border-border rounded-card">
              <table className="w-full text-sm" aria-label="Mesas del plano">
                <thead className="bg-canvas text-xs text-muted">
                  <tr>
                    {(
                      [
                        { field: 'numeroMesa', label: 'Número' },
                        { field: 'capacidad', label: 'Capacidad' },
                        { field: 'zona', label: 'Zona' },
                      ] as const
                    ).map(({ field, label }) => (
                      <th
                        key={field}
                        scope="col"
                        aria-sort={
                          sort.campo === field
                            ? sort.sentido === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                        className={cn(
                          'px-4 py-2 font-semibold',
                          field === 'zona' ? 'text-left' : 'text-right',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(field)}
                          aria-label={`Ordenar por ${label.toLowerCase()}`}
                          className={cn(
                            'h-control w-full inline-flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary rounded-control',
                            field !== 'zona' && 'justify-end',
                          )}
                        >
                          {label}
                          {sort.campo !== field ? (
                            <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : sort.sentido === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-2 text-right font-semibold">
                      Estado
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((mesa) => (
                    <tr key={mesa.mesaId} data-testid={`mesa-admin-row-${mesa.mesaId}`}>
                      <th scope="row" className="px-4 py-3 text-right font-semibold text-ink">
                        {mesa.numeroMesa}
                      </th>
                      <td className="px-4 py-3 text-right tabular-nums">{mesa.capacidad}</td>
                      <td className="px-4 py-3 text-left break-words max-w-xs">{mesa.zona}</td>
                      <td className="px-4 py-3 text-right">
                        <EstadoBadge mesa={mesa} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MesaAcciones mesa={mesa} onAction={openAction} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul aria-label="Mesas del plano en móvil" className="md:hidden space-y-3">
              {filtered.map((mesa) => (
                <li
                  key={mesa.mesaId}
                  className="bg-surface border border-border rounded-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-ink">Mesa {mesa.numeroMesa}</h3>
                    <EstadoBadge mesa={mesa} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted break-words min-w-0 flex-1">
                      {mesa.capacidad} personas · {mesa.zona}
                    </p>
                    <MesaAcciones mesa={mesa} onAction={openAction} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ))}

      {modal && modal.type !== 'baja' && (
        <MesaFormModal
          key={modal.type === 'editar' ? modal.mesa.mesaId : 'crear'}
          mesa={modal.type === 'editar' ? modal.mesa : null}
          mesas={mesas}
          onClose={() => setModal(null)}
          onSuccess={(saved) => {
            setNotice(
              `Mesa ${saved.numeroMesa} ${modal.type === 'crear' ? 'creada' : 'actualizada'}.`,
            );
            setModal(null);
          }}
        />
      )}
      {modal?.type === 'baja' && (
        <BajaMesaModal
          mesa={modal.mesa}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setNotice(`Mesa ${modal.mesa.numeroMesa} dada de baja.`);
            setModal(null);
          }}
        />
      )}
    </section>
  );
}
