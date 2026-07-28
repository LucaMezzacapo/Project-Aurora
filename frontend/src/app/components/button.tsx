
interface ButtonProps {
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
    title: string;
    className?: string;
}

export default function Button({
    disabled = false,
    loading = false,
    onClick,
    title,
    className = "",
}: ButtonProps) {
    return(
        <button 
            className={`button ${className}`}
            disabled ={disabled || loading} 
            onClick={onClick}
        >

            {loading ? 'Loading...' : title}
        </button>
    );
}