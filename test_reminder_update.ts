import { createClient } from '@supabase/supabase-js'

// No Lovable env, as variáveis estão disponíveis diretamente no ambiente de execução do script quando rodado via exec se configurado,
// mas aqui usaremos a abordagem de query direta via psql para ser infalível.
