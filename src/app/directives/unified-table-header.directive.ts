import { Directive, ElementRef, EventEmitter, Input, OnInit, Output, Renderer2 } from '@angular/core';

/**
 * Aplica o padrão unificado de tabelas (cabeçalho, zebra, compact, sticky) sem repetir classes no template.
 * Uso:
 * <table appUnifiedTableHeader [striped]="true" [compact]="true" [sticky]="true"></table>
 */
@Directive({
  selector: '[appUnifiedTableHeader]',
  standalone: true
})
export class UnifiedTableHeaderDirective implements OnInit {
  @Input() striped = false;
  @Input() compact = false;
  @Input() sticky = false;
  @Input() scrollWrapper = false;
  /** density: 'comfortable' | 'compact' | 'ultra' */
  @Input() density: 'comfortable' | 'compact' | 'ultra' = 'comfortable';
  /** Emite true quando há overflow vertical, false quando não há */
  @Output() overflowChange = new EventEmitter<boolean>();

  constructor(private el: ElementRef<HTMLTableElement>, private rd: Renderer2) {}

  ngOnInit(): void {
    const table = this.el.nativeElement;
    // Evita sobrescrever tabelas que explicitly opt-out
    if (table.classList.contains('no-theme-table')) return;

    if (this.striped) this.rd.addClass(table, 'table-striped');
    if (this.compact) this.rd.addClass(table, 'table-compact');
    // Densidade (prioriza density sobre compact boolean se definido)
    switch (this.density) {
      case 'compact':
        this.rd.addClass(table, 'table-density-compact');
        break;
      case 'ultra':
        this.rd.addClass(table, 'table-density-ultra');
        break;
      default:
        this.rd.addClass(table, 'table-density-comfortable');
    }
    if (this.sticky) this.rd.addClass(table, 'table-sticky');

    if (this.scrollWrapper) {
      // Envolve a tabela em um wrapper de scroll se não existir
      const parent = table.parentElement;
      if (parent && !parent.classList.contains('table-scroll-wrapper')) {
        const wrapper = this.rd.createElement('div');
        this.rd.addClass(wrapper, 'table-scroll-wrapper');
        parent.replaceChild(wrapper, table);
        this.rd.appendChild(wrapper, table);
        // Observa scroll para aplicar sombra
        const evaluateOverflow = () => {
          const hasOverflow = wrapper.scrollHeight > wrapper.clientHeight + 2;
          this.overflowChange.emit(hasOverflow);
          const atBottom = wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight < 4;
          if (!atBottom) wrapper.classList.add('is-scrolling'); else wrapper.classList.remove('is-scrolling');
        };
        wrapper.addEventListener('scroll', evaluateOverflow, { passive: true });
        // Avaliação inicial pós-microtask
        setTimeout(evaluateOverflow, 0);
      }
    }
  }
}
