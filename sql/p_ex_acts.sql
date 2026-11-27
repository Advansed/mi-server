ALTER procedure [dbo].[p_ex_acts]( @json varchar(max))
as


    SELECT
		id into #vrem
    FROM OPENJSON(@json, '$.data')
	WITH (
		id uniqueidentifier '$.id'
	);

	if exists( select * from #vrem )
		update a set posted = 0x01 from d_acts a inner join #vrem b on a.id = b.id

	declare @out nvarchar(max)

	declare @type varchar(2) = json_value(@json, '$.act')

	set @out = (
		select top 10
			  a.id
			, a.act_number
			, a.act_date
			, a.status
			, a.invoice_id
			, b.lic_id
			, a.title
			, JSON_QUERY(details) details
		from d_acts a
			left join t_orders b on a.invoice_id = b.id and a.lic_id = b.lic_id
		where( posted is null or posted = 0x00)
		and case
				when  @type is null then type
				WHEN @type = '01' THEN 'actbr'					--Акт замены АКБ счетчика
				WHEN @type = '02' THEN 'actmr'					--Акт замены прибора учета
				WHEN @type = '03' THEN 'actms'					--
				WHEN @type = '04' THEN 'actplomb'				--Акт пломбирования
				WHEN @type = '05' THEN 'actsf'					--Акт снятия пломбы
				WHEN @type = '06' THEN 'actsge'					--Aкт отключения бытового газоиспользующего оборудования
				WHEN @type = '07' THEN 'actda'					--Акт недопуска для проведения проверки (отключения)
				WHEN @type = '08' THEN 'actmrr'					--Акт снятия показаний
				WHEN @type = '09' THEN 'actdo'					--Акт наряд на отключение (Ф29Э)
				WHEN @type = '10' THEN 'predp'					--Предписание
				WHEN @type = '11' THEN 'actaad'					--Акт проверки газифицированного объекта (ААД)
				WHEN @type = '12' THEN 'actwc'					--Акт выполненных работ
				WHEN @type = '13' THEN 'work_completed_to'		--Акт выполненных работ
			end = type
		order by act_date desc
		for json path
	)

	select '{"success": true, "data": ' + IsNull(@out, '[]')  +'}' data
GO
