import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { PaginationMeta } from "@/lib/types";

type PaginationProps = {
  meta: PaginationMeta;
  disabled?: boolean;
  onPageChange: (page: number) => void;
};

export function Pagination({ meta, disabled = false, onPageChange }: PaginationProps) {
  if (meta.totalPages <= 1) return null;

  const firstItem = (meta.page - 1) * meta.pageSize + 1;
  const lastItem = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <nav className="pagination" aria-label="Pagination">
      <span>
        {firstItem}–{lastItem} of {meta.total}
      </span>
      <div>
        <button
          type="button"
          className="secondary"
          aria-label="Previous page"
          disabled={disabled || meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          <IconChevronLeft size={17} />
          <span>Previous</span>
        </button>
        <strong>
          Page {meta.page} of {meta.totalPages}
        </strong>
        <button
          type="button"
          className="secondary"
          aria-label="Next page"
          disabled={disabled || meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          <span>Next</span>
          <IconChevronRight size={17} />
        </button>
      </div>
    </nav>
  );
}
