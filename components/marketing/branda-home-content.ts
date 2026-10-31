export type HomeText = readonly [string, string];

export const homeFeatures = [
  { icon: "Heart", title: ["نظام ولاء العملاء", "Customer loyalty"], body: ["حوّل الزيارة الأولى إلى علاقة مستمرة مع نقاط ومكافآت وبطاقات رقمية يحتفظ بها العميل في محفظة جواله", "Turn first visits into lasting relationships with points, rewards and digital cards in your customers' mobile wallets"], kind: "loyalty" },
  { icon: "Bell", title: ["الإشعارات الذكية", "Smart notifications"], body: ["شارك جديد عروضك مع العملاء وأرسل إشعارات مرتبطة بالموقع عندما يصبحون قريبين من فرعك", "Share your latest offers and send location-aware notifications when customers are near your business"], kind: "notifications" },
  { icon: "Monitor", title: ["نظام الكاشير ونقاط البيع", "Point of sale"], body: ["طلبات ومدفوعات بخطوات سريعة وواجهة واضحة تساعد فريقك على خدمة العملاء حتى في أوقات الازدحام", "Keep orders and payments moving with a clear interface built for your team, even during busy hours"], kind: "standard" },
  { icon: "Smartphone", title: ["منيو أو متجر إلكتروني", "Online menu or store"], body: ["اعرض منتجاتك في منيو أو متجر يتيح لعميلك تصفح الأصناف وطلبها واختيار الاستلام من جواله", "Let customers browse your products, place an order and choose pickup directly from their phones"], kind: "standard" },
  { icon: "Package", title: ["إدارة المخزون", "Inventory management"], body: ["تابع الأصناف والكميات والوصفات وأوامر الإنتاج والتحويلات بين الفروع مع الجرد وتسجيل الهدر", "Track products, quantities, recipes, production, branch transfers, stock counts and waste"], kind: "standard" },
  { icon: "ChartColumnIncreasing", title: ["التقارير المالية", "Financial reporting"], body: ["اطّلع على المبيعات والمصروفات والأرباح والضرائب في تقارير تساعدك على اتخاذ القرار بثقة", "Understand sales, expenses, profit and tax with reporting that helps you make informed decisions"], kind: "standard" },
  { icon: "ShieldCheck", title: ["الربط مع هيئة الزكاة والضريبة والجمارك", "ZATCA integration"], body: ["فوترة إلكترونية وفواتير ضريبية ضمن أدوات إدارة نشاطك، مع دعم متطلبات هيئة الزكاة والضريبة والجمارك", "Electronic and tax invoicing within your business tools, with support for ZATCA requirements"], kind: "tax" },
  { icon: "Gift", title: ["بطاقات الهدايا", "Gift cards"], body: ["قدّم لعملائك بطاقات هدايا رقمية يشاركونها مع من يحبون، وافتح لنشاطك فرصة جديدة للوصول إلى العملاء", "Give your customers digital gift cards to share and introduce new people to your business"], kind: "standard" },
  { icon: "Users", title: ["إدارة العملاء", "Customer management"], body: ["احتفظ ببيانات العملاء وتاريخ مشترياتهم في مكان واحد، وتعرّف على اهتماماتهم لبناء عروض تناسبهم", "Keep customer details and purchase history together to understand preferences and create relevant offers"], kind: "standard" },
  { icon: "Star", title: ["بطاقة تقييمات Google", "Google review cards"], body: ["اجعل مشاركة التقييم أسهل على عملائك ببطاقة تقودهم إلى صفحة نشاطك على Google", "Make it easier for customers to share their experience with a card that opens your Google business page"], kind: "standard" },
  { icon: "ReceiptText", title: ["إدارة الحسابات والفواتير", "Accounts and invoices"], body: ["رتّب فواتيرك وحساباتك وعمليات الدفع في سجل واضح يسهل البحث فيه والرجوع إلى تفاصيله", "Organize invoices, accounts and payments in one clear, searchable record"], kind: "standard" },
  { icon: "Armchair", title: ["إدارة الطاولات", "Table management"], body: ["تابع إشغال الطاولات واربط الطلبات بها ليعرف فريقك حالة الصالة ويقدم خدمة أكثر تنظيمًا", "See table availability and linked orders so your team can keep service organized"], kind: "standard" },
  { icon: "CalendarDays", title: ["إدارة الحجوزات", "Reservations"], body: ["اجمع المواعيد وحجوزات الطاولات والعملاء في جدول واحد واضح يسهل على فريقك متابعته", "Bring appointments, table reservations and customer bookings into one easy-to-follow schedule"], kind: "standard" },
  { icon: "Wallet", title: ["إدارة المصروفات", "Expense management"], body: ["سجّل تكاليف التشغيل أولًا بأول وتابع أثرها في تقاريرك لتعرف أين تُصرف ميزانية نشاطك", "Record operating costs as they happen and see how they affect your business finances"], kind: "standard" },
  { icon: "Store", title: ["إدارة الفروع والشفتات والموظفين", "Branches, shifts and staff"], body: ["وحّد متابعة الفروع والموظفين وورديات العمل وقارن أداء المواقع من لوحة إدارة واحدة", "Manage locations, employees and shifts together and compare branch performance in one dashboard"], kind: "standard" },
  { icon: "ChefHat", title: ["شاشة المطبخ", "Kitchen display"], body: ["اعرض الطلبات الجديدة أمام فريق التحضير فور تسجيلها، وتابع مراحل تجهيزها حتى تصبح جاهزة", "Show new orders to your preparation team immediately and track them until they are ready"], kind: "standard" },
] as const;

export const homeIndustries = [
  ["🍽️", "مطاعم", "Restaurants"], ["☕", "مقاهي", "Cafés"], ["🏪", "متاجر", "Retail"], ["🥖", "مخابز", "Bakeries"], ["💈", "حلاقين", "Barbers"],
  ["💇‍♀️", "صالونات", "Salons"], ["🧺", "مغاسل ملابس", "Laundries"], ["🚗", "مغاسل سيارات", "Car washes"], ["💐", "ورد وهدايا", "Flowers & gifts"], ["🧴", "عطور وتجميل", "Beauty & perfumes"],
  ["🥬", "خضار وفواكه", "Fruit & vegetables"], ["👗", "ملابس وأحذية وعبايات", "Clothing & footwear"], ["📱", "محلات جوالات", "Mobile stores"], ["🛒", "بقالات وتموينات", "Groceries"], ["🍰", "حلويات ومعجنات", "Sweets & pastries"],
  ["🍦", "عصائر وآيس كريم", "Juice & ice cream"], ["🫘", "محامص وبن", "Coffee roasters"], ["🌴", "تمور وعطارة", "Dates & spices"], ["🚚", "فود ترك", "Food trucks"], ["✏️", "مكتبات وقرطاسية", "Books & stationery"],
] as const;

export const homeOutcomes = [
  ["Gauge", "إدارة أسرع", "Faster management", "نفّذ أعمالك اليومية من مكان واحد", "Run everyday operations in one place"],
  ["CheckCheck", "أخطاء أقل", "Fewer errors", "خفّف الإدخال اليدوي وتكرار الحسابات", "Reduce manual entry and repeated calculations"],
  ["ScanLine", "متابعة أدق", "Better visibility", "ابقَ على اطلاع بحركة البيع والمخزون", "Stay up to date with sales and inventory"],
  ["Heart", "عملاء يرجعون", "Returning customers", "كافئ زيارات عملائك وشجّع عودتهم", "Reward customers and encourage their next visit"],
  ["Star", "تقييمات أكثر", "More reviews", "سهّل مشاركة تجربة عملائك على Google", "Make sharing a Google review easier"],
  ["ShoppingBag", "تجربة طلب أسهل", "Easier ordering", "من تصفح المنتجات إلى استلام الطلب", "From browsing products to collecting orders"],
  ["ChartColumnIncreasing", "رؤية مالية أوضح", "Clearer finances", "تابع دخلك وتكاليفك وربحية نشاطك", "Understand income, costs and profitability"],
  ["Layers", "برامج أقل", "Fewer subscriptions", "اجمع أدواتك بدل التنقل بين الأنظمة", "Keep your tools together instead of switching systems"],
] as const;

export const homePlans = [
  { id: "launch", name: ["الإنطلاقة", "Launch"], eyebrow: ["الأساسيات المتكاملة", "The complete essentials"], description: ["أدوات التشغيل اليومية وإدارة نشاطك في باقة واحدة", "Everyday operations and business management in one plan"], price: 99, features: [
    ["الكاشير ونقطة البيع", "Cashier and point of sale"], ["المنيو أو المتجر الإلكتروني", "Online menu or store"], ["المنتجات والمخزون · منتجات غير محدودة", "Products and inventory · unlimited products"], ["العملاء والولاء وبطاقات الهدايا", "Customers, loyalty and gift cards"], ["الطاولات والحجوزات", "Tables and reservations"], ["الفوترة الإلكترونية والتقارير المالية", "E-invoicing and financial reports"], ["الموظفين والورديات والفروع", "Staff, shifts and branches"],
  ] },
  { id: "advanced", name: ["المتقدمة", "Advanced"], eyebrow: ["إمكانات أكثر", "More possibilities"], description: ["تشغيل ومخزون أكثر تفصيلًا مع تطبيق بهوية نشاطك", "Advanced operations and inventory with your own branded app"], price: 299, features: [
    ["شاشة المطبخ والتجهيز، وشاشة حالة الطلبات", "Kitchen, preparation and order-status displays"], ["الوصفات والتركيبات وأوامر الإنتاج", "Recipes, components and production orders"], ["فواتير الشراء والمورّدون", "Purchase invoices and suppliers"], ["تحويلات المخزون بين الفروع", "Stock transfers between branches"], ["تقارير الربحية وسجل النشاط", "Profitability reports and activity log"], ["عروض الأسعار ودفتر الآجل", "Quotations and credit ledger"], ["المنتجات والخدمات بلا حد", "Unlimited products and services"], ["تطبيق خاص باسم نشاطك", "Your own branded app"],
  ] },
] as const;

export const homeComparison = [
  { group: ["البيع والطلبات", "Sales and orders"], rows: [["نظام الكاشير ونقاط البيع", "Point of sale", true], ["منيو أو متجر إلكتروني", "Online menu or store", true], ["إدارة الطاولات والحجوزات", "Tables and reservations", true], ["الخصومات والعروض", "Discounts and offers", true], ["شاشة المطبخ والتجهيز", "Kitchen and preparation display", false], ["شاشة حالة الطلبات للعملاء", "Customer order-status display", false]] },
  { group: ["المنتجات والمخزون", "Products and inventory"], rows: [["المنتجات والخدمات", "Products and services", "unlimited"], ["إدارة المخزون والجرد والهدر", "Inventory, stock counts and waste", true], ["الوصفات والتركيبات وأوامر الإنتاج", "Recipes and production orders", false], ["فواتير الشراء والمورّدون", "Purchase invoices and suppliers", false], ["تحويلات المخزون بين الفروع", "Stock transfers", false]] },
  { group: ["العملاء والتسويق", "Customers and marketing"], rows: [["إدارة العملاء", "Customer management", true], ["نظام ولاء العملاء", "Customer loyalty", true], ["بطاقات الهدايا", "Gift cards", true], ["الإشعارات الذكية", "Smart notifications", true], ["بطاقة تقييمات Google", "Google review card", true]] },
  { group: ["المالية والفوترة", "Finance and invoicing"], rows: [["الربط مع هيئة الزكاة والضريبة والجمارك", "ZATCA integration", true], ["إدارة الحسابات والفواتير", "Accounts and invoices", true], ["إدارة المصروفات", "Expense management", true], ["التقارير المالية", "Financial reports", true], ["تقارير الربحية", "Profitability reports", false], ["عروض الأسعار", "Quotations", false], ["دفتر الآجل", "Credit ledger", false]] },
  { group: ["الفريق والفروع", "Team and branches"], rows: [["حسابات الموظفين", "Staff accounts", "unlimited"], ["الورديات وإدارة الفروع", "Shifts and branch management", true], ["سجل النشاط", "Activity log", false]] },
  { group: ["حضورك الرقمي", "Your digital presence"], rows: [["تطبيق خاص باسم نشاطك", "Your own branded app", false]] },
] as const;

export const homeFaq = [
  ["هل النظام مناسب للمطاعم والمتاجر؟", "Does it work for restaurants and stores?", "نعم، تجمع برندة أدوات تناسب المطاعم والمقاهي ومتاجر التجزئة والأنشطة الخدمية، ويمكن اختيار الباقة بحسب احتياج النشاط", "Yes, Branda brings together tools for restaurants, cafés, retail and service businesses, with plans for different needs"],
  ["هل يدعم عدة فروع؟", "Can I manage multiple branches?", "يمكنك متابعة فروعك وموظفيك والورديات من حساب واحد، مع الاطلاع على أداء كل فرع", "Manage branches, employees and shifts from one account and review each location's performance"],
  ["هل يشمل نظام كاشير وإدارة مخزون؟", "Are POS and inventory included?", "تشمل باقة برندة المالية نقطة البيع وأدوات متابعة المنتجات والكميات والمخزون", "Branda Finance includes point of sale, products and inventory"],
  ["هل يمكن إنشاء برنامج ولاء؟", "Can I create a loyalty program?", "تتيح أدوات الولاء تصميم بطاقة لعلامتك ومكافأة العملاء على زياراتهم ومشترياتهم", "Create a branded loyalty card and reward customers for visits and purchases"],
  ["هل يدعم Apple Wallet وGoogle Wallet؟", "Does it support Apple Wallet and Google Wallet?", "نعم، يمكن حفظ بطاقات الولاء الرقمية في محفظة أبل ومحفظة قوقل ليصل إليها العميل من جواله", "Yes, customers can save digital loyalty cards to Apple Wallet and Google Wallet"],
  ["هل يمكن للعميل الطلب أونلاين؟", "Can customers order online?", "يستطيع العميل استعراض منتجات النشاط عبر المنيو أو المتجر الإلكتروني ومتابعة الطلب وفق خيارات الخدمة المتاحة", "Customers can browse your menu or online store and order through your available service options"],
  ["هل يدعم الفواتير الضريبية؟", "Does it support tax invoices?", "تضم المنصة أدوات إصدار الفواتير الضريبية ومتابعتها ضمن نظام الحسابات والفوترة الإلكترونية", "The platform includes tax invoice issuance and tracking within its accounting and e-invoicing tools"],
  ["هل توجد تقارير مالية؟", "Are financial reports available?", "نعم، يمكنك مراجعة تقارير البيع والمصروفات والضرائب، وتتوفر تقارير إضافية بحسب الباقة", "Yes, review sales, expenses and tax reports, with additional reporting depending on your plan"],
  ["هل يمكن إدارة الطاولات والحجوزات؟", "Can I manage tables and reservations?", "تتوفر أدوات لتنظيم الطاولات وحجوزات العملاء ومواعيدهم بحسب نوع نشاطك", "Tools are available for organizing tables, customer bookings and appointments for your business"],
  ["كيف أبدأ؟", "How do I get started?", "اختر الباقة التي تناسبك وتواصل مع فريق برندة لمساعدتك في تجهيز حساب نشاطك والبدء", "Choose a plan and contact the Branda team to help set up your business account"],
] as const;

export const homePartners = [
  [4, "بيت الشاورما", "Shawarma House"], [5, "تشكي تشيز", "Chuck E. Cheese"], [6, "فيلا ماماز", "Villa Mamas"], [7, "أشجار كافيه", "Ashjar Café"], [8, "حاشي باشا", "Hashi Basha"], [9, "البيتزا الساخنة", "Hot Pizza"], [10, "Easy Bakery", "Easy Bakery"],
] as const;
