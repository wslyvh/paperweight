interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  page,
  totalPages,
  onPageChange,
}: PaginationProps): JSX.Element {
  return (
    <div className="flex justify-center">
      <div className="join">
        <button
          className="join-item btn btn-sm"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <button className="join-item btn btn-sm btn-disabled">
          Page {page} of {totalPages}
        </button>
        <button
          className="join-item btn btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
