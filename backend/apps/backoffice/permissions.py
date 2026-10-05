def can_view_reports(request) -> bool:
    return request.user.has_perm("backoffice.view_salesreport")
