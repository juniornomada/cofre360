-- Categories
DROP POLICY IF EXISTS "Categories are readable by all authenticated users" ON public.categories;
CREATE POLICY "Categories are readable by everyone" 
ON public.categories 
FOR SELECT 
USING (true);

-- Subcategories
DROP POLICY IF EXISTS "Subcategories are readable by all authenticated users" ON public.subcategories;
CREATE POLICY "Subcategories are readable by everyone" 
ON public.subcategories 
FOR SELECT 
USING (true);
