# Tasas de IVU — cómo se cambian

`tax_rules` guarda **vigencias**: una fila por (tipo de cliente, categoría,
fecha desde la que aplica). Nada se sobrescribe cuando la tasa cambia de
verdad; se agrega una fila nueva. Ver `migrations/2026-09-21-tax-rules-history.sql`.

Quién resuelve qué, para saber qué se mueve al tocar la tabla:

| Documento | De dónde sale su IVU | ¿Lo afecta cambiar `tax_rules`? |
|---|---|---|
| Factura, estimado, orden de cambio | `tax_rate` guardado en cada línea | **No.** Ni al reeditarlo |
| Trabajo, solicitud, propuesta — líneas viejas | `tax_rate` guardado (backfill del 2026-09-21) | **No** |
| Trabajo, solicitud, propuesta — líneas nuevas | vigencia a la fecha de creación del documento | **Sí** |
| Documento nuevo | vigencia a su fecha de emisión | Sí, que es lo que se busca |

---

## 1. Ver el estado actual

```sql
select tr.client_type, tr.line_item_type, tr.rate, tr.label, tr.effective_from,
       case
         when tr.effective_from > current_date then 'futura'
         when tr.effective_from = (
           select max(x.effective_from) from tax_rules x
           where x.client_type = tr.client_type
             and x.line_item_type = tr.line_item_type
             and x.effective_from <= current_date
         ) then 'ACTIVA'
         else 'histórica'
       end as estado
from tax_rules tr
order by tr.client_type, tr.line_item_type, tr.effective_from desc;
```

## 2. Registrar un cambio de tasa — el camino normal

Fila nueva, nunca un update. Fechar a futuro es válido y recomendado: la
registras hoy y entra sola ese día.

```sql
insert into tax_rules (client_type, line_item_type, rate, label, effective_from)
values ('final'::client_type, 'labor'::line_item_type, 0.12, 'IVU General 12%', date '2027-01-01');
```

Valores de `client_type`: `final`, `b2b`. De `line_item_type`: `labor`,
`product`, `reembolso`. La tasa va en fracción (0.12 = 12%), no en por ciento.

Si el cambio aplica a varias combinaciones, una fila por cada una.

## 3. Corregir una vigencia futura — seguro

Ningún documento la ha usado todavía.

```sql
update tax_rules set rate = 0.125, label = 'IVU General 12.5%'
where client_type = 'final'::client_type
  and line_item_type = 'labor'::line_item_type
  and effective_from = date '2027-01-01';
```

Para moverle la fecha, cambia `effective_from` en el mismo update.

## 4. Borrar una vigencia futura — seguro

```sql
delete from tax_rules
where client_type = 'final'::client_type
  and line_item_type = 'labor'::line_item_type
  and effective_from = date '2027-01-01'
  and effective_from > current_date;   -- la guarda: nunca borra una ya activa
```

## 5. Corregir la tasa que está activa hoy — con cuidado

Solo para un error de captura, no para un cambio real de tasa (eso es el paso
2). Facturas, estimados y órdenes de cambio no se mueven. Trabajos,
solicitudes y propuestas con líneas sin congelar **sí se recalculan**.

Primero mira a cuántos les pega. Cambia las dos constantes de arriba:

```sql
with objetivo as (
  select 'final'::client_type as ct, 'labor'::line_item_type as lt
)
select 'trabajos' as doc, count(distinct j.id) as documentos
from job_line_items li
join jobs j on j.id = li.job_id
left join clients c on c.id = j.client_id
cross join objetivo o
where li.tax_rate is null
  and coalesce(c.client_type, 'final'::client_type) = o.ct
  and (case when coalesce(li.tax_category, li.type::text) in ('labor','product','reembolso')
            then coalesce(li.tax_category, li.type::text) else 'product' end) = o.lt::text
union all
select 'solicitudes', count(distinct s.id)
from solicitud_line_items li
join solicitudes s on s.id = li.solicitud_id
left join clients c on c.id = s.client_id
cross join objetivo o
where li.tax_rate is null
  and coalesce(c.client_type, 'final'::client_type) = o.ct
  and (case when coalesce(li.tax_category, li.type::text) in ('labor','product','reembolso')
            then coalesce(li.tax_category, li.type::text) else 'product' end) = o.lt::text
union all
select 'propuestas', count(distinct p.id)
from proposal_line_items li
join proposal_options po on po.id = li.option_id
join proposals p on p.id = po.proposal_id
left join clients c on c.id = p.client_id
cross join objetivo o
where li.tax_rate is null
  and coalesce(c.client_type, 'final'::client_type) = o.ct
  and (case when li.item_type::text = 'product' then 'product' else 'labor' end) = o.lt::text;
```

Si el número te parece bien, entonces:

```sql
update tax_rules set rate = 0.115, label = 'IVU General 11.5%'
where client_type = 'final'::client_type
  and line_item_type = 'labor'::line_item_type
  and effective_from = (
    select max(effective_from) from tax_rules
    where client_type = 'final'::client_type
      and line_item_type = 'labor'::line_item_type
      and effective_from <= current_date
  );
```

---

## Lo que nunca se hace

- **Borrar la vigencia más antigua de una combinación** (la semilla del
  2020-01-01). Es el piso del historial: sin ella, cualquier documento
  anterior a la siguiente vigencia se queda sin regla y cae al respaldo de
  11.5% — que para labor B2B, que va al 4%, sería incorrecto.
- **Dos filas con la misma fecha** para una combinación. El unique
  `tax_rules_vigencia_unica` lo impide, y por eso existe.
- **Sobrescribir la tasa activa para aplicar un cambio real de IVU.** Se
  pierde el historial y se recalculan documentos vivos hacia atrás. Fila
  nueva, siempre.

## Después de tocar la tabla

Las pantallas leen `tax_rules` al montarse, así que basta con recargar. Para
comprobar que no se movió nada que no debía: abre una factura vieja y su
formulario de edición — los dos totales tienen que seguir idénticos.
